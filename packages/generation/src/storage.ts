import { createHash, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { get } from "node:https";
import { BlockList, isIP } from "node:net";
import { resolve } from "node:path";
import { MAX_IMAGE_BYTES } from "./index";

const MAX_REDIRECTS = 3;
const DOWNLOAD_TIMEOUT_MS = 120_000;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const trustedImageHosts = [
  "bytepluscdn.com",
  "byteimg.com",
  "ibytedtos.com",
  "tos-ap-southeast-1.bytepluses.com",
  "tos-eu-west-1.bytepluses.com",
  // BytePlus ModelArk image generation currently returns signed Volcengine TOS
  // URLs from this service domain in AP Southeast.
  "tos-ap-southeast-1.volces.com",
] as const;

const allowedContentTypes = new Set([
  "image/png",
  "application/octet-stream",
  "binary/octet-stream",
]);

const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["192.0.0.0", 24],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(address, prefix, "ipv4");

export type ImageStorageErrorCode =
  | "IMAGE_OUTPUT_URL_INVALID"
  | "IMAGE_OUTPUT_HOST_UNTRUSTED"
  | "IMAGE_OUTPUT_DNS_UNSAFE"
  | "IMAGE_OUTPUT_DNS_FAILED"
  | "IMAGE_OUTPUT_REDIRECT_INVALID"
  | "IMAGE_OUTPUT_HTTP_FAILED"
  | "IMAGE_OUTPUT_CONTENT_TYPE"
  | "IMAGE_OUTPUT_TOO_LARGE"
  | "IMAGE_OUTPUT_INVALID_PNG"
  | "IMAGE_OUTPUT_DOWNLOAD_FAILED"
  | "STORAGE_WRITE_FAILED";

export class ImageStorageError extends Error {
  constructor(
    public readonly code: ImageStorageErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ImageStorageError";
  }
}

export function isTrustedImageHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return trustedImageHosts.some(
    (trusted) =>
      normalized === trusted || normalized.endsWith(`.${trusted}`),
  );
}

function parseTrustedImageUrl(urlString: string): URL {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch (error) {
    throw new ImageStorageError(
      "IMAGE_OUTPUT_URL_INVALID",
      "Provider returned an invalid image URL.",
      { cause: error },
    );
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    isIP(url.hostname) ||
    !isTrustedImageHostname(url.hostname)
  ) {
    throw new ImageStorageError(
      "IMAGE_OUTPUT_HOST_UNTRUSTED",
      "Provider returned an untrusted image host.",
    );
  }

  return url;
}

async function resolvePublicIpv4(hostname: string): Promise<string> {
  let addresses: Awaited<ReturnType<typeof lookup>>;
  try {
    addresses = await lookup(hostname, { all: true, family: 4 });
  } catch (error) {
    throw new ImageStorageError(
      "IMAGE_OUTPUT_DNS_FAILED",
      "Generated image host could not be resolved.",
      { cause: error },
    );
  }

  if (
    !addresses.length ||
    addresses.some(
      (address) =>
        address.family !== 4 || blocked.check(address.address, "ipv4"),
    )
  ) {
    throw new ImageStorageError(
      "IMAGE_OUTPUT_DNS_UNSAFE",
      "Generated image host resolved to an unsafe address.",
    );
  }

  return addresses[0]!.address;
}

function responseContentType(value: string | undefined): string | null {
  return value?.split(";", 1)[0]?.trim().toLowerCase() || null;
}

async function downloadTrustedImage(
  url: URL,
  redirectsRemaining: number,
): Promise<Buffer> {
  const pinnedAddress = await resolvePublicIpv4(url.hostname);

  return new Promise<Buffer>((resolveDownload, rejectDownload) => {
    const request = get(
      url,
      {
        family: 4,
        lookup: (_hostname, _options, callback) =>
          callback(null, pinnedAddress, 4),
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      },
      (response) => {
        const status = response.statusCode ?? 0;

        if (status >= 300 && status < 400) {
          const location = response.headers.location;
          response.resume();

          if (!location || redirectsRemaining <= 0) {
            rejectDownload(
              new ImageStorageError(
                "IMAGE_OUTPUT_REDIRECT_INVALID",
                "Generated image redirect was rejected.",
              ),
            );
            return;
          }

          let redirected: URL;
          try {
            redirected = parseTrustedImageUrl(new URL(location, url).toString());
          } catch (error) {
            rejectDownload(error);
            return;
          }

          void downloadTrustedImage(redirected, redirectsRemaining - 1).then(
            resolveDownload,
            rejectDownload,
          );
          return;
        }

        if (status !== 200) {
          response.resume();
          rejectDownload(
            new ImageStorageError(
              "IMAGE_OUTPUT_HTTP_FAILED",
              "Generated image download returned an unexpected status.",
            ),
          );
          return;
        }

        const contentType = responseContentType(
          Array.isArray(response.headers["content-type"])
            ? response.headers["content-type"][0]
            : response.headers["content-type"],
        );
        if (contentType && !allowedContentTypes.has(contentType)) {
          response.resume();
          rejectDownload(
            new ImageStorageError(
              "IMAGE_OUTPUT_CONTENT_TYPE",
              "Generated image response had an unexpected content type.",
            ),
          );
          return;
        }

        const declaredLength = Number(response.headers["content-length"]);
        if (
          Number.isFinite(declaredLength) &&
          declaredLength > MAX_IMAGE_BYTES
        ) {
          response.resume();
          rejectDownload(
            new ImageStorageError(
              "IMAGE_OUTPUT_TOO_LARGE",
              "Generated image exceeded the storage size limit.",
            ),
          );
          return;
        }

        const parts: Buffer[] = [];
        let size = 0;
        response.on("data", (part: Buffer) => {
          size += part.length;
          if (size > MAX_IMAGE_BYTES) {
            response.destroy(
              new ImageStorageError(
                "IMAGE_OUTPUT_TOO_LARGE",
                "Generated image exceeded the storage size limit.",
              ),
            );
            return;
          }
          parts.push(part);
        });
        response.on("end", () => resolveDownload(Buffer.concat(parts)));
        response.on("error", (error) => {
          rejectDownload(
            error instanceof ImageStorageError
              ? error
              : new ImageStorageError(
                  "IMAGE_OUTPUT_DOWNLOAD_FAILED",
                  "Generated image download was interrupted.",
                  { cause: error },
                ),
          );
        });
      },
    );

    request.on("error", (error) => {
      rejectDownload(
        error instanceof ImageStorageError
          ? error
          : new ImageStorageError(
              "IMAGE_OUTPUT_DOWNLOAD_FAILED",
              "Generated image download failed.",
              { cause: error },
            ),
      );
    });
  });
}

export function storagePath(key: string) {
  if (!/^[a-zA-Z0-9_-]+\.png$/.test(key))
    throw new Error("Invalid storage key");
  const root =
    process.env.ASSET_STORAGE_ROOT ?? "/var/www/creator-platform/shared/assets";
  if (!root.startsWith("/")) throw new Error("Storage root must be absolute");
  return resolve(root, key);
}

export async function readStoredImage(key: string) {
  return readFile(storagePath(key));
}

export async function downloadImage(urlString: string) {
  const url = parseTrustedImageUrl(urlString);
  const bytes = await downloadTrustedImage(url, MAX_REDIRECTS);

  if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new ImageStorageError(
      "IMAGE_OUTPUT_INVALID_PNG",
      "Generated image failed PNG validation.",
    );
  }

  return bytes;
}

export async function storeImage(key: string, bytes: Buffer) {
  const path = storagePath(key);
  const temporary = `${path}.${randomUUID()}.tmp`;

  try {
    await mkdir(resolve(path, ".."), { recursive: true, mode: 0o750 });
    await writeFile(temporary, bytes, { mode: 0o640, flag: "wx" });
    await rename(temporary, path);
  } catch (error) {
    throw new ImageStorageError(
      "STORAGE_WRITE_FAILED",
      "Generated image could not be written to persistent storage.",
      { cause: error },
    );
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }

  return {
    byteSize: BigInt(bytes.byteLength),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
