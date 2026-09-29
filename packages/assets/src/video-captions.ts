import { videoEditDocumentSchema } from "./video-edit";

export type CaptionFormat = "srt" | "vtt";

function timestamp(ms: number, format: CaptionFormat): string {
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor(ms / 60_000) % 60;
  const seconds = Math.floor(ms / 1000) % 60;
  const separator = format === "vtt" ? "." : ",";
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}${separator}${String(ms % 1000).padStart(3, "0")}`;
}

/** Export only validated, saved edit data. The original Unicode text is preserved. */
export function formatVideoCaptions(
  document: unknown,
  format: CaptionFormat,
): string {
  const parsed = videoEditDocumentSchema.parse(document);
  const entries = [...parsed.captions].sort(
    (a, b) => a.startMs - b.startMs || a.endMs - b.endMs,
  );
  const cues = entries.map((entry, index) => {
    // A saved caption is a single line. Prevent cue delimiter injection.
    const content = entry.text.replace(/[\r\n]/g, " ");
    const range = `${timestamp(entry.startMs, format)} --> ${timestamp(entry.endMs, format)}`;
    return `${index + 1}\n${range}\n${content}`;
  });
  return `${format === "vtt" ? "WEBVTT\n\n" : ""}${cues.join("\n\n")}${cues.length ? "\n" : ""}`;
}
