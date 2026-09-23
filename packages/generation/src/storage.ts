import { createHash, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { get } from "node:https";
import { BlockList, isIP } from "node:net";
import { isAbsolute, resolve } from "node:path";
import { MAX_AUDIO_BYTES, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES } from "./index";

const MAX_REDIRECTS = 3;
const DOWNLOAD_TIMEOUT_MS = 120_000;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const trustedImageDomainSuffixes = [
  "bytepluscdn.com",
  "byteimg.com",
  "ibytedtos.com",
  "tos-ap-southeast-1.bytepluses.com",
  "tos-eu-west-1.bytepluses.com",
] as const;

const trustedExactImageHosts = new Set([
  // BytePlus documents these AP Southeast object-storage origins for generated
  // Seedream and Seedance media. Keep this list exact rather than trusting the
  // entire volces.com TOS namespace.
  "ark-acg-ap-southeast-1.tos-ap-southeast-1.volces.com",
  "ark-content-generation-ap-southeast-1.tos-ap-southeast-1.volces.com",
  "ark-content-generation-v2-ap-southeast-1.tos-ap-southeast-1.volces.com",
]);

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
  | "VIDEO_OUTPUT_URL_INVALID"
  | "VIDEO_OUTPUT_HOST_UNTRUSTED"
  | "VIDEO_OUTPUT_DNS_UNSAFE"
  | "VIDEO_OUTPUT_HTTP_FAILED"
  | "VIDEO_OUTPUT_CONTENT_TYPE"
  | "VIDEO_OUTPUT_TOO_LARGE"
  | "VIDEO_OUTPUT_INVALID_MP4"
  | "VIDEO_OUTPUT_DOWNLOAD_FAILED"
  | "AUDIO_OUTPUT_INVALID_MP3"
  | "AUDIO_OUTPUT_TOO_LARGE"
  | "AUDIO_OUTPUT_EMPTY"
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
  return (
    trustedExactImageHosts.has(normalized) ||
    trustedImageDomainSuffixes.some(
      (trusted) => normalized === trusted || normalized.endsWith(`.${trusted}`),
    )
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
  let addresses: { address: string; family: number }[];
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
            redirected = parseTrustedImageUrl(
              new URL(location, url).toString(),
            );
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
  if (!/^[a-zA-Z0-9_-]+\.(png|mp4|mp3)$/.test(key))
    throw new Error("Invalid storage key");
  const root =
    process.env.ASSET_STORAGE_ROOT ?? "/var/www/creator-platform/shared/assets";
  if (!isAbsolute(root)) throw new Error("Storage root must be absolute");
  return resolve(root, key);
}

export async function readStoredAsset(key: string) {
  // Shared assets live outside the immutable Next.js release bundle.
  return readFile(/* turbopackIgnore: true */ storagePath(key));
}

export async function deleteStoredAsset(key: string) {
  await rm(/* turbopackIgnore: true */ storagePath(key), { force: true });
}

export async function storedAssetSize(key: string): Promise<number> {
  const result = await stat(/* turbopackIgnore: true */ storagePath(key));
  return result.size;
}

export async function readStoredAssetRange(
  key: string,
  start: number,
  end: number,
): Promise<Buffer> {
  const length = end - start + 1;
  const output = Buffer.allocUnsafe(length);
  const handle = await open(/* turbopackIgnore: true */ storagePath(key), "r");
  try {
    const { bytesRead } = await handle.read(output, 0, length, start);
    return output.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

// Kept for compatibility with callers introduced by the image-only milestone.
export const readStoredImage = readStoredAsset;

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

function parseTrustedVideoUrl(urlString: string): URL {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch (error) {
    throw new ImageStorageError(
      "VIDEO_OUTPUT_URL_INVALID",
      "Provider returned an invalid video URL.",
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
  )
    throw new ImageStorageError(
      "VIDEO_OUTPUT_HOST_UNTRUSTED",
      "Provider returned an untrusted video host.",
    );
  return url;
}

async function downloadTrustedVideo(
  url: URL,
  redirectsRemaining: number,
): Promise<Buffer> {
  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(url.hostname, { all: true, family: 4 });
  } catch (error) {
    throw new ImageStorageError(
      "VIDEO_OUTPUT_DNS_UNSAFE",
      "Generated video host could not be resolved safely.",
      { cause: error },
    );
  }
  if (
    !addresses.length ||
    addresses.some((a) => a.family !== 4 || blocked.check(a.address, "ipv4"))
  )
    throw new ImageStorageError(
      "VIDEO_OUTPUT_DNS_UNSAFE",
      "Generated video host resolved to an unsafe address.",
    );
  const address = addresses[0]!;
  return new Promise<Buffer>((resolveDownload, reject) => {
    const request = get(
      url,
      {
        family: 4,
        lookup: (_hostname, _options, callback) =>
          callback(null, address.address, 4),
        signal: AbortSignal.timeout(120000),
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          const location = response.headers.location;
          response.resume();
          if (!location || redirectsRemaining <= 0) {
            reject(
              new ImageStorageError(
                "VIDEO_OUTPUT_HTTP_FAILED",
                "Generated video redirect was rejected.",
              ),
            );
            return;
          }
          let redirected: URL;
          try {
            redirected = parseTrustedVideoUrl(
              new URL(location, url).toString(),
            );
          } catch (error) {
            reject(error);
            return;
          }
          void downloadTrustedVideo(redirected, redirectsRemaining - 1).then(
            resolveDownload,
            reject,
          );
          return;
        }
        if (status !== 200) {
          response.resume();
          reject(
            new ImageStorageError(
              "VIDEO_OUTPUT_HTTP_FAILED",
              "Generated video download returned an unexpected status.",
            ),
          );
          return;
        }
        const contentType = responseContentType(
          Array.isArray(response.headers["content-type"])
            ? response.headers["content-type"][0]
            : response.headers["content-type"],
        );
        if (
          contentType &&
          ![
            "video/mp4",
            "application/octet-stream",
            "binary/octet-stream",
          ].includes(contentType)
        ) {
          response.resume();
          reject(
            new ImageStorageError(
              "VIDEO_OUTPUT_CONTENT_TYPE",
              "Generated video response had an unexpected content type.",
            ),
          );
          return;
        }
        const declaredLength = Number(response.headers["content-length"]);
        if (
          Number.isFinite(declaredLength) &&
          declaredLength > MAX_VIDEO_BYTES
        ) {
          response.resume();
          reject(
            new ImageStorageError(
              "VIDEO_OUTPUT_TOO_LARGE",
              "Generated video exceeded the storage size limit.",
            ),
          );
          return;
        }
        const parts: Buffer[] = [];
        let size = 0;
        response.on("data", (part: Buffer) => {
          size += part.length;
          if (size > MAX_VIDEO_BYTES) {
            response.destroy(
              new ImageStorageError(
                "VIDEO_OUTPUT_TOO_LARGE",
                "Generated video exceeded the storage size limit.",
              ),
            );
            return;
          }
          parts.push(part);
        });
        response.on("end", () => resolveDownload(Buffer.concat(parts)));
        response.on("error", (error) =>
          reject(
            error instanceof ImageStorageError
              ? error
              : new ImageStorageError(
                  "VIDEO_OUTPUT_DOWNLOAD_FAILED",
                  "Generated video download was interrupted.",
                  { cause: error },
                ),
          ),
        );
      },
    );
    request.on("error", (error) =>
      reject(
        error instanceof ImageStorageError
          ? error
          : new ImageStorageError(
              "VIDEO_OUTPUT_DOWNLOAD_FAILED",
              "Generated video download failed.",
              { cause: error },
            ),
      ),
    );
  });
}

export async function downloadVideo(urlString: string) {
  const url = parseTrustedVideoUrl(urlString);
  const bytes = await downloadTrustedVideo(url, MAX_REDIRECTS);

  if (bytes.length < 12)
    throw new ImageStorageError(
      "VIDEO_OUTPUT_INVALID_MP4",
      "Generated video failed MP4 validation.",
    );
  const ftyp = bytes.subarray(4, 8).toString("ascii");
  if (ftyp !== "ftyp") {
    throw new ImageStorageError(
      "VIDEO_OUTPUT_INVALID_MP4",
      "Generated video failed MP4 validation.",
    );
  }
  return bytes;
}

export async function storeVideo(key: string, bytes: Buffer) {
  const path = storagePath(key);
  const temporary = `${path}.${randomUUID()}.tmp`;

  try {
    await mkdir(resolve(path, ".."), { recursive: true, mode: 0o750 });
    await writeFile(temporary, bytes, { mode: 0o640, flag: "wx" });
    await rename(temporary, path);
  } catch (error) {
    throw new ImageStorageError(
      "STORAGE_WRITE_FAILED",
      "Generated video could not be written to persistent storage.",
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

export function validateMp3Bytes(bytes: Buffer): { durationMs: number | null } {
  if (bytes.length === 0) {
    throw new ImageStorageError(
      "AUDIO_OUTPUT_EMPTY",
      "Generated audio was empty.",
    );
  }
  if (bytes.length > MAX_AUDIO_BYTES) {
    throw new ImageStorageError(
      "AUDIO_OUTPUT_TOO_LARGE",
      "Generated audio exceeded the storage size limit.",
    );
  }
  if (bytes.length < 4) {
    throw new ImageStorageError(
      "AUDIO_OUTPUT_INVALID_MP3",
      "Generated audio failed MP3 validation.",
    );
  }

  let offset = 0;
  // Check for ID3v2 header: "ID3" (0x49, 0x44, 0x33)
  if (
    bytes.length >= 10 &&
    bytes[0] === 0x49 &&
    bytes[1] === 0x44 &&
    bytes[2] === 0x33
  ) {
    if (
      [bytes[6], bytes[7], bytes[8], bytes[9]].some((value) => value! > 0x7f)
    ) {
      throw new ImageStorageError(
        "AUDIO_OUTPUT_INVALID_MP3",
        "Generated audio failed MP3 validation.",
      );
    }
    const flags = bytes[5]!;
    const hasFooter = (flags & 0x10) !== 0;
    // Synchsafe integer (7 bits per byte)
    const tagSize =
      ((bytes[6]! & 0x7f) << 21) |
      ((bytes[7]! & 0x7f) << 14) |
      ((bytes[8]! & 0x7f) << 7) |
      (bytes[9]! & 0x7f);
    offset = 10 + tagSize + (hasFooter ? 10 : 0);
    if (offset >= bytes.length) {
      throw new ImageStorageError(
        "AUDIO_OUTPUT_INVALID_MP3",
        "Generated audio failed MP3 validation.",
      );
    }
  }

  // Require two structurally valid consecutive MPEG Layer III frames. Checking
  // only the sync bits produces false positives in arbitrary binary data.
  const searchLimit = Math.min(bytes.length - 1, offset + 4096);
  let foundFrames = false;

  for (let i = offset; i < searchLimit; i++) {
    const frameLength = mp3FrameLength(bytes, i);
    if (frameLength === null) continue;
    const nextOffset = i + frameLength;
    if (mp3FrameLength(bytes, nextOffset) !== null) {
      foundFrames = true;
      break;
    }
  }

  if (!foundFrames) {
    throw new ImageStorageError(
      "AUDIO_OUTPUT_INVALID_MP3",
      "Generated audio failed MP3 validation.",
    );
  }

  return { durationMs: null };
}

export async function storeAudio(key: string, bytes: Buffer) {
  validateMp3Bytes(bytes);
  const path = storagePath(key);
  const temporary = `${path}.${randomUUID()}.tmp`;

  try {
    await mkdir(resolve(path, ".."), { recursive: true, mode: 0o750 });
    await writeFile(temporary, bytes, { mode: 0o600, flag: "wx" });
    await rename(temporary, path);
  } catch (error) {
    throw new ImageStorageError(
      "STORAGE_WRITE_FAILED",
      "Generated audio could not be written to persistent storage.",
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

function mp3FrameLength(bytes: Buffer, offset: number): number | null {
  if (offset < 0 || offset + 4 > bytes.length) return null;
  const first = bytes[offset]!;
  const second = bytes[offset + 1]!;
  const third = bytes[offset + 2]!;
  if (first !== 0xff || (second & 0xe0) !== 0xe0) return null;

  const versionBits = (second >> 3) & 0x03;
  const layerBits = (second >> 1) & 0x03;
  if (versionBits === 0x01 || layerBits !== 0x01) return null;

  const bitrateIndex = (third >> 4) & 0x0f;
  const sampleRateIndex = (third >> 2) & 0x03;
  if (bitrateIndex === 0 || bitrateIndex === 0x0f || sampleRateIndex === 0x03)
    return null;

  const mpeg1Bitrates = [
    0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
  ];
  const mpeg2Bitrates = [
    0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160,
  ];
  const sampleRateBase = [44_100, 48_000, 32_000][sampleRateIndex]!;
  const isMpeg1 = versionBits === 0x03;
  const sampleRate =
    versionBits === 0x00
      ? sampleRateBase / 4
      : versionBits === 0x02
        ? sampleRateBase / 2
        : sampleRateBase;
  const bitrateKbps = (isMpeg1 ? mpeg1Bitrates : mpeg2Bitrates)[bitrateIndex]!;
  const padding = (third >> 1) & 0x01;
  const frameLength =
    Math.floor(((isMpeg1 ? 144 : 72) * bitrateKbps * 1000) / sampleRate) +
    padding;
  return frameLength >= 4 && offset + frameLength <= bytes.length
    ? frameLength
    : null;
}
