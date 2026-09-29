import { isIP } from "node:net";

export const MAX_REMOTE_IMAGE_BYTES = 20_000_000;

export function approvedImageUrl(raw: string, allowlist: string): URL {
  if (raw.length > 2048) throw new Error("Image URL is too long.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Enter a valid HTTPS image URL.");
  }
  const allowed = new Set(
    allowlist
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  );
  if (
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    isIP(url.hostname) ||
    !allowed.has(url.hostname.toLowerCase())
  ) {
    throw new Error("Image host is not approved for import.");
  }
  return url;
}

export async function fetchApprovedImage(
  url: URL,
  fetcher: typeof fetch = fetch,
): Promise<Buffer> {
  const response = await fetcher(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(12_000),
    headers: { Accept: "image/jpeg,image/png,image/webp" },
    cache: "no-store",
  });
  if (!response.ok || response.status >= 300 || !response.body)
    throw new Error("Image link did not return a usable image.");
  if (
    !/^(image\/jpeg|image\/png|image\/webp)(?:;|$)/i.test(
      response.headers.get("content-type") ?? "",
    )
  )
    throw new Error("Image link returned an unsupported content type.");
  const sizeHeader = response.headers.get("content-length");
  if (
    sizeHeader &&
    (!/^\d+$/.test(sizeHeader) || Number(sizeHeader) > MAX_REMOTE_IMAGE_BYTES)
  )
    throw new Error("Linked image exceeds the 20 MB import limit.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_REMOTE_IMAGE_BYTES)
        throw new Error("Linked image exceeds the 20 MB import limit.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  if (length === 0) throw new Error("Linked image was empty.");
  return Buffer.concat(chunks, length);
}
