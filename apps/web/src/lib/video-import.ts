import { isIP } from "node:net";
import { open } from "node:fs/promises";

export const MAX_LINK_VIDEO_BYTES = 100_000_000;
export function approvedVideoUrl(raw: string, allowedHosts: string): URL {
  if (raw.length > 2048) throw new Error("Video URL is too long.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Enter a valid HTTPS video URL.");
  }
  const approved = new Set(
    allowedHosts
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
  if (
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    isIP(url.hostname) ||
    !approved.has(url.hostname.toLowerCase())
  )
    throw new Error("Video host is not approved for import.");
  return url;
}

export async function downloadApprovedVideo(
  url: URL,
  path: string,
  fetcher: typeof fetch = fetch,
): Promise<number> {
  const response = await fetcher(url, {
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
    headers: { Accept: "video/mp4" },
  });
  if (!response.ok || response.status >= 300 || !response.body)
    throw new Error("Video link did not return a usable file.");
  if (!/^video\/mp4(?:;|$)/i.test(response.headers.get("content-type") ?? ""))
    throw new Error("Video link must return an MP4 file.");
  const length = response.headers.get("content-length");
  if (
    length &&
    (!/^\d+$/.test(length) || Number(length) > MAX_LINK_VIDEO_BYTES)
  )
    throw new Error("Video link exceeds 100 MB.");
  const reader = response.body.getReader();
  const output = await open(path, "wx", 0o600);
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_LINK_VIDEO_BYTES)
        throw new Error("Video link exceeds 100 MB.");
      await output.writeFile(value);
    }
  } finally {
    await output.close();
    await reader.cancel().catch(() => undefined);
  }
  if (!bytes) throw new Error("Video link was empty.");
  return bytes;
}
