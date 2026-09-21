import { createHash, randomUUID } from "node:crypto";
import { get } from "node:https";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { MAX_IMAGE_BYTES } from "./index";

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
  const url = new URL(urlString);
  // Only provider CDN domains; no redirects, credentials, IP literals or custom ports.
  const suffixes = [
    ".bytepluscdn.com",
    ".byteimg.com",
    ".ibytedtos.com",
    ".tos-ap-southeast-1.bytepluses.com",
    ".tos-eu-west-1.bytepluses.com",
  ];
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    isIP(url.hostname) ||
    !suffixes.some((s) => url.hostname.endsWith(s))
  )
    throw new Error("Untrusted image host");
  const addresses = await lookup(url.hostname, { all: true, family: 4 });
  if (
    !addresses.length ||
    addresses.some((a) => a.family !== 4 || blocked.check(a.address, "ipv4"))
  )
    throw new Error("Unsafe image address");
  const address = addresses[0]!;
  // Pin the verified address while retaining the original TLS hostname.
  const bytes = await new Promise<Buffer>((resolveDownload, reject) => {
    const request = get(
      url,
      {
        family: 4,
        lookup: (_hostname, _options, callback) =>
          callback(null, address.address, 4),
        signal: AbortSignal.timeout(120000),
      },
      (response) => {
        if (
          response.statusCode !== 200 ||
          response.headers["content-type"]?.split(";")[0] !== "image/png"
        ) {
          response.destroy();
          reject(new Error("Image download failed"));
          return;
        }
        const parts: Buffer[] = [];
        let size = 0;
        response.on("data", (part: Buffer) => {
          size += part.length;
          if (size > MAX_IMAGE_BYTES) {
            response.destroy(new Error("Image exceeds size limit"));
            return;
          }
          parts.push(part);
        });
        response.on("end", () => resolveDownload(Buffer.concat(parts)));
        response.on("error", reject);
      },
    );
    request.on("error", reject);
  });
  if (
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    throw new Error("Invalid PNG output");
  return bytes;
}
export async function storeImage(key: string, bytes: Buffer) {
  const path = storagePath(key);
  await mkdir(resolve(path, ".."), { recursive: true, mode: 0o750 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, bytes, { mode: 0o640, flag: "wx" });
  await rename(temporary, path);
  return {
    byteSize: BigInt(bytes.byteLength),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
