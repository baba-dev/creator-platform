export async function readLearnBody(request: Request, limit = 180000) {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.length;
    if (size > limit) {
      await reader.cancel();
      throw new Error("Article too large");
    }
    chunks.push(next.value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
