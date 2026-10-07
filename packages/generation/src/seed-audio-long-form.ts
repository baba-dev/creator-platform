import { withMediaCapacity } from "@aiwa/assets/media-capacity";
import {
  ProviderRequestError,
  type MediaGenerationProvider,
} from "@aiwa/providers";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const SEED_AUDIO_NATIVE_MAX_SECONDS = 120;
export const SEED_AUDIO_LONG_FORM_MAX_SECONDS = 300;
export const SEED_AUDIO_LONG_FORM_MAX_PROMPT_CHARS = 7_500;
export const SEED_AUDIO_SEGMENT_TARGET_SECONDS = 105;
export const SEED_AUDIO_LONG_FORM_MAX_SEGMENTS = 3;
export const SEED_AUDIO_CROSSFADE_MS = 40;
export const SEED_AUDIO_LONG_FORM_MAX_OUTPUT_BYTES = 96 * 1024 * 1024;

export type SeedAudioFormat = "wav" | "mp3" | "pcm" | "ogg_opus";

export type SeedAudioSubtitle = {
  text: string;
  sentences: Array<{ startMs: number; endMs: number; text: string }>;
  words: Array<{ startMs: number; endMs: number; text: string }>;
};

export type SeedAudioLongFormSegment = {
  index: number;
  prompt: string;
  text: string;
  estimatedDurationSeconds: number;
};

function splitDirection(textPrompt: string): {
  direction: string;
  spokenText: string;
} {
  const normalized = textPrompt.replace(/\r\n/g, "\n").trim();
  const separator = normalized.indexOf("\n\n");
  if (separator <= 0 || separator > 1_000)
    return { direction: "", spokenText: normalized };
  return {
    direction: normalized.slice(0, separator).trim(),
    spokenText: normalized.slice(separator + 2).trim(),
  };
}

function splitOversizedUnit(unit: string, maxChars: number): string[] {
  if (unit.length <= maxChars) return [unit];
  const words = unit.split(/\s+/u).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const word of words) {
    if (word.length > maxChars) {
      if (current) chunks.push(current);
      current = "";
      for (let start = 0; start < word.length; start += maxChars)
        chunks.push(word.slice(start, start + maxChars));
      continue;
    }
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars) {
      if (current) chunks.push(current);
      current = word;
    } else current = next;
  }
  if (current) chunks.push(current);
  return chunks;
}

function sentenceUnits(text: string, maxChars: number): string[] {
  const raw = text
    .split(/(?<=[.!?。！？])\s+|\n{2,}/u)
    .map((value) => value.trim())
    .filter(Boolean);
  return raw.flatMap((unit) => splitOversizedUnit(unit, maxChars));
}

function groupUnits(
  units: string[],
  requestedSegments: number,
  maxChars: number,
): string[] {
  if (!units.length) return [];
  const totalChars = units.reduce((sum, unit) => sum + unit.length + 1, 0);
  const target = Math.min(
    maxChars,
    Math.max(1, Math.ceil(totalChars / requestedSegments)),
  );
  const segments: string[] = [];
  let current = "";
  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index]!;
    const remainingUnits = units.length - index;
    const remainingSlots = Math.max(1, requestedSegments - segments.length);
    const next = current ? `${current} ${unit}` : unit;
    const shouldClose =
      current &&
      (next.length > maxChars ||
        (current.length >= target &&
          remainingUnits >= Math.max(1, remainingSlots - 1)));
    if (shouldClose) {
      segments.push(current);
      current = unit;
    } else current = next;
  }
  if (current) segments.push(current);

  while (segments.length < requestedSegments) {
    let bestIndex = -1;
    let bestLength = 0;
    for (let index = 0; index < segments.length; index += 1) {
      if (segments[index]!.length > bestLength) {
        bestIndex = index;
        bestLength = segments[index]!.length;
      }
    }
    if (bestIndex < 0) break;
    const words = segments[bestIndex]!.split(/\s+/u);
    if (words.length < 2) break;
    const midpoint = Math.ceil(words.length / 2);
    const left = words.slice(0, midpoint).join(" ");
    const right = words.slice(midpoint).join(" ");
    segments.splice(bestIndex, 1, left, right);
  }
  return segments;
}

export function planSeedAudioLongForm(
  textPrompt: string,
  estimatedDurationSeconds: number,
): {
  direction: string;
  spokenText: string;
  segments: SeedAudioLongFormSegment[];
} {
  if (
    !Number.isSafeInteger(estimatedDurationSeconds) ||
    estimatedDurationSeconds < 1 ||
    estimatedDurationSeconds > SEED_AUDIO_LONG_FORM_MAX_SECONDS
  )
    throw new RangeError("Long-form duration is outside the supported range.");
  const normalized = textPrompt.trim();
  if (
    !normalized ||
    normalized.length > SEED_AUDIO_LONG_FORM_MAX_PROMPT_CHARS
  )
    throw new RangeError("Long-form script is outside the supported size.");
  const { direction, spokenText } = splitDirection(normalized);
  if (!spokenText) throw new RangeError("Long-form narration is empty.");

  const continuity =
    "Maintain the exact same vocal identity, timbre, pace, recording perspective, and emotional direction as the surrounding segments.";
  const overhead = direction.length + continuity.length + 120;
  const maxScriptChars = Math.max(900, 3_000 - overhead);
  const byDuration = Math.ceil(
    estimatedDurationSeconds / SEED_AUDIO_SEGMENT_TARGET_SECONDS,
  );
  const byChars = Math.ceil(spokenText.length / maxScriptChars);
  const requestedSegments = Math.max(1, byDuration, byChars);
  if (requestedSegments > SEED_AUDIO_LONG_FORM_MAX_SEGMENTS)
    throw new RangeError(
      "Long-form narration exceeds the current three-segment production envelope.",
    );
  const units = sentenceUnits(spokenText, maxScriptChars);
  const grouped = groupUnits(units, requestedSegments, maxScriptChars);
  if (!grouped.length || grouped.length > SEED_AUDIO_LONG_FORM_MAX_SEGMENTS)
    throw new RangeError("Long-form narration could not be segmented safely.");

  const totalChars = grouped.reduce((sum, value) => sum + value.length, 0);
  const segments = grouped.map((text, index) => {
    const ratio = text.length / Math.max(1, totalChars);
    const estimated = Math.max(
      1,
      Math.min(
        SEED_AUDIO_NATIVE_MAX_SECONDS,
        Math.round(estimatedDurationSeconds * ratio),
      ),
    );
    const continuityLine =
      grouped.length === 1
        ? continuity
        : `${continuity} This is part ${index + 1} of ${grouped.length}; ${index === 0 ? "begin naturally and leave a clean continuation." : index === grouped.length - 1 ? "continue naturally from the previous part and finish cleanly." : "continue naturally from the previous part and leave a clean continuation."}`;
    const prompt = [direction, continuityLine, "", text]
      .filter((value, itemIndex) => value || itemIndex === 2)
      .join("\n")
      .trim();
    if (prompt.length > 3_000)
      throw new RangeError(
        "A long-form segment exceeds the Seed Audio prompt limit.",
      );
    return {
      index,
      prompt,
      text,
      estimatedDurationSeconds: estimated,
    };
  });
  return { direction, spokenText, segments };
}

function subtitleFromUsage(value: unknown): SeedAudioSubtitle | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const parseItems = (items: unknown) =>
    Array.isArray(items)
      ? items
          .filter(
            (item): item is Record<string, unknown> =>
              Boolean(item) && typeof item === "object" && !Array.isArray(item),
          )
          .map((item) => ({
            startMs: Number(item.startMs),
            endMs: Number(item.endMs),
            text: typeof item.text === "string" ? item.text : "",
          }))
          .filter(
            (item) =>
              Number.isSafeInteger(item.startMs) &&
              Number.isSafeInteger(item.endMs) &&
              item.startMs >= 0 &&
              item.endMs >= item.startMs &&
              item.text.length > 0,
          )
      : [];
  return {
    text: typeof raw.text === "string" ? raw.text : "",
    sentences: parseItems(raw.sentences),
    words: parseItems(raw.words),
  };
}

export function mergeSeedAudioSubtitles(
  subtitles: Array<SeedAudioSubtitle | null>,
  segmentDurationsSeconds: number[],
  crossfadeMs = SEED_AUDIO_CROSSFADE_MS,
): SeedAudioSubtitle | null {
  if (!subtitles.some(Boolean)) return null;
  const sentences: SeedAudioSubtitle["sentences"] = [];
  const words: SeedAudioSubtitle["words"] = [];
  const text: string[] = [];
  let offsetMs = 0;
  subtitles.forEach((subtitle, index) => {
    if (subtitle) {
      if (subtitle.text.trim()) text.push(subtitle.text.trim());
      for (const sentence of subtitle.sentences)
        sentences.push({
          ...sentence,
          startMs: Math.max(0, sentence.startMs + offsetMs),
          endMs: Math.max(0, sentence.endMs + offsetMs),
        });
      for (const word of subtitle.words)
        words.push({
          ...word,
          startMs: Math.max(0, word.startMs + offsetMs),
          endMs: Math.max(0, word.endMs + offsetMs),
        });
    }
    const durationMs = Math.max(
      0,
      Math.round((segmentDurationsSeconds[index] ?? 0) * 1000),
    );
    offsetMs += durationMs;
    if (index < subtitles.length - 1) offsetMs -= crossfadeMs;
  });
  return { text: text.join(" "), sentences, words };
}

async function runFfmpeg(args: string[]): Promise<void> {
  await withMediaCapacity(
    () =>
      new Promise<void>((resolve, reject) => {
        const child = spawn("ffmpeg", args, {
          stdio: ["ignore", "ignore", "pipe"],
        });
        let diagnostics = "";
        const timer = setTimeout(() => child.kill("SIGKILL"), 180_000);
        child.stderr.on("data", (chunk: Buffer) => {
          if (diagnostics.length < 16_000)
            diagnostics += chunk.toString("utf8").slice(0, 16_000);
        });
        child.on("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          if (code === 0) resolve();
          else
            reject(
              new Error(
                `Long-form audio stitching failed (${code ?? "unknown"}): ${diagnostics.slice(-1_000)}`,
              ),
            );
        });
      }),
  );
}

function extension(format: SeedAudioFormat): string {
  return format === "ogg_opus" ? "ogg" : format;
}

export async function stitchSeedAudioSegments(input: {
  segments: Buffer[];
  format: SeedAudioFormat;
  sampleRate: number;
  maxOutputBytes: number;
}): Promise<{ bytes: Buffer; crossfadeMs: number }> {
  if (!input.segments.length) throw new Error("No audio segments to stitch.");
  if (input.segments.length === 1)
    return { bytes: input.segments[0]!, crossfadeMs: 0 };
  if (input.segments.length > SEED_AUDIO_LONG_FORM_MAX_SEGMENTS)
    throw new Error("Too many audio segments to stitch.");

  const work = await mkdtemp(join(tmpdir(), "aiwa-seed-audio-"));
  try {
    const ext = extension(input.format);
    const paths = await Promise.all(
      input.segments.map(async (bytes, index) => {
        const path = join(work, `segment-${index}.${ext}`);
        await writeFile(path, bytes);
        return path;
      }),
    );
    const output = join(work, `output.${ext}`);
    const args = [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-threads",
      "1",
      ...paths.flatMap((path) => ["-i", path]),
    ];
    const filters: string[] = paths.map(
      (_path, index) =>
        `[${index}:a]aresample=${input.sampleRate},aformat=sample_fmts=fltp:channel_layouts=stereo,loudnorm=I=-16:LRA=11:TP=-1.5[a${index}]`,
    );
    let label = "a0";
    for (let index = 1; index < paths.length; index += 1) {
      filters.push(
        `[${label}][a${index}]acrossfade=d=${(SEED_AUDIO_CROSSFADE_MS / 1000).toFixed(3)}:c1=tri:c2=tri[x${index}]`,
      );
      label = `x${index}`;
    }
    args.push("-filter_complex", filters.join(";"), "-map", `[${label}]`);
    if (input.format === "mp3")
      args.push("-c:a", "libmp3lame", "-b:a", "192k", "-f", "mp3");
    else if (input.format === "wav")
      args.push("-c:a", "pcm_s16le", "-f", "wav");
    else if (input.format === "pcm")
      args.push("-c:a", "pcm_s16le", "-f", "s16le");
    else
      args.push("-c:a", "libopus", "-b:a", "160k", "-f", "ogg");
    args.push("-y", output);
    await runFfmpeg(args);
    const bytes = await readFile(output);
    if (!bytes.length || bytes.length > input.maxOutputBytes)
      throw new Error("Stitched long-form audio exceeds the storage limit.");
    return {
      bytes,
      crossfadeMs: SEED_AUDIO_CROSSFADE_MS * (paths.length - 1),
    };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

export class SeedAudioPartialGenerationError extends Error {
  constructor(
    message: string,
    public readonly completedSegments: number,
    public readonly providerRequestIds: string[],
    public readonly code = "LONG_FORM_PARTIAL_PROVIDER_RUN",
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "SeedAudioPartialGenerationError";
  }
}

function decodeProviderAudio(base64: string): Buffer {
  const bytes = Buffer.from(base64, "base64");
  const canonical = bytes.toString("base64").replace(/=+$/u, "");
  if (!bytes.length || canonical !== base64.replace(/=+$/u, ""))
    throw new ProviderRequestError(
      "BytePlus returned malformed voice audio",
      true,
      { code: "INVALID_PROVIDER_RESPONSE" },
    );
  return bytes;
}

export async function produceSeedAudioLongForm(input: {
  provider: MediaGenerationProvider;
  idempotencyKey: string;
  modelId: string;
  baseProviderInput: Record<string, unknown>;
  textPrompt: string;
  estimatedDurationSeconds: number;
  expectedMediaType: string;
  format: SeedAudioFormat;
  sampleRate: number;
  maxOutputBytes: number;
}): Promise<{
  audioBytes: Buffer;
  providerRequestId: string;
  providerDurationSeconds: number;
  playbackDurationSeconds: number;
  subtitle: SeedAudioSubtitle | null;
  metadata: {
    segmentCount: number;
    segmentDurationsSeconds: number[];
    providerRequestIds: string[];
    crossfadeMs: number;
  };
}> {
  const plan = planSeedAudioLongForm(
    input.textPrompt,
    input.estimatedDurationSeconds,
  );
  const buffers: Buffer[] = [];
  const durations: number[] = [];
  const subtitles: Array<SeedAudioSubtitle | null> = [];
  const providerRequestIds: string[] = [];

  for (const segment of plan.segments) {
    let result;
    try {
      result = await input.provider.submit({
        idempotencyKey: `${input.idempotencyKey}:segment:${segment.index + 1}`,
        modelId: input.modelId,
        mediaKind: "voice",
        input: {
          ...input.baseProviderInput,
          textPrompt: segment.prompt,
        },
      });
      if (
        result.status !== "succeeded" ||
        result.inlineOutputs?.length !== 1 ||
        result.inlineOutputs[0]?.mediaType !== input.expectedMediaType ||
        !result.inlineOutputs[0]?.dataBase64
      )
        throw new ProviderRequestError(
          "BytePlus returned an unexpected long-form voice result",
          true,
          { code: "INVALID_PROVIDER_RESPONSE" },
        );
      const duration = result.rawUsage?.generatedSeconds;
      if (
        typeof duration !== "number" ||
        !Number.isFinite(duration) ||
        duration <= 0 ||
        duration > SEED_AUDIO_NATIVE_MAX_SECONDS
      )
        throw new ProviderRequestError(
          "BytePlus returned invalid long-form duration metadata",
          true,
          { code: "INVALID_PROVIDER_RESPONSE" },
        );
      buffers.push(decodeProviderAudio(result.inlineOutputs[0].dataBase64));
      durations.push(duration);
      subtitles.push(subtitleFromUsage(result.rawUsage?.subtitle));
      providerRequestIds.push(result.providerRequestId);
    } catch (error) {
      if (buffers.length)
        throw new SeedAudioPartialGenerationError(
          "Long-form generation stopped after one or more provider segments completed. Credits remain reserved for review.",
          buffers.length,
          providerRequestIds,
          "LONG_FORM_PARTIAL_PROVIDER_RUN",
          { cause: error },
        );
      throw error;
    }
  }

  let stitched;
  try {
    stitched = await stitchSeedAudioSegments({
      segments: buffers,
      format: input.format,
      sampleRate: input.sampleRate,
      maxOutputBytes: input.maxOutputBytes,
    });
  } catch (error) {
    throw new SeedAudioPartialGenerationError(
      "Provider segments completed but final audio stitching failed. Credits remain reserved for review.",
      buffers.length,
      providerRequestIds,
      "LONG_FORM_STITCH_FAILED",
      { cause: error },
    );
  }

  const providerDurationSeconds = durations.reduce(
    (sum, duration) => sum + duration,
    0,
  );
  const playbackDurationSeconds = Math.max(
    0.001,
    providerDurationSeconds - stitched.crossfadeMs / 1000,
  );
  return {
    audioBytes: stitched.bytes,
    providerRequestId: providerRequestIds[0]!,
    providerDurationSeconds,
    playbackDurationSeconds,
    subtitle: mergeSeedAudioSubtitles(
      subtitles,
      durations,
      SEED_AUDIO_CROSSFADE_MS,
    ),
    metadata: {
      segmentCount: plan.segments.length,
      segmentDurationsSeconds: durations,
      providerRequestIds,
      crossfadeMs: stitched.crossfadeMs,
    },
  };
}
