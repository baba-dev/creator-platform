import { describe, expect, it } from "vitest";
import {
  mergeSeedAudioSubtitles,
  planSeedAudioLongForm,
  produceSeedAudioLongForm,
  SEED_AUDIO_NATIVE_MAX_SECONDS,
  stitchSeedAudioSegments,
  type SeedAudioSegmentCheckpoint,
} from "../src/seed-audio-long-form";
import type { MediaGenerationProvider } from "@aiwa/providers";

function silentWav(sampleRate = 24_000, durationMs = 120): Buffer {
  const samples = Math.round((sampleRate * durationMs) / 1000);
  const dataBytes = samples * 2;
  const bytes = Buffer.alloc(44 + dataBytes);
  bytes.write("RIFF", 0, "ascii");
  bytes.writeUInt32LE(36 + dataBytes, 4);
  bytes.write("WAVE", 8, "ascii");
  bytes.write("fmt ", 12, "ascii");
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36, "ascii");
  bytes.writeUInt32LE(dataBytes, 40);
  return bytes;
}

function wavSampleRate(bytes: Buffer): number {
  const fmt = bytes.indexOf(Buffer.from("fmt "));
  if (fmt < 0) throw new Error("Missing WAV fmt chunk");
  return bytes.readUInt32LE(fmt + 12);
}

describe("Seed Audio long-form planning", () => {
  it("keeps native-length narration in one provider segment", () => {
    const plan = planSeedAudioLongForm(
      "Warm documentary direction.\n\nA short narration with a clean ending.",
      90,
    );
    expect(plan.segments).toHaveLength(1);
    expect(plan.segments[0]!.prompt.length).toBeLessThanOrEqual(3000);
  });

  it("splits longer narration on sentence boundaries within provider limits", () => {
    const script = Array.from(
      { length: 90 },
      (_, index) =>
        `Sentence ${index + 1} carries the story forward with a natural cadence.`,
    ).join(" ");
    const plan = planSeedAudioLongForm(
      `Documentary voice, intimate and steady.\n\n${script}`,
      260,
    );
    expect(plan.segments.length).toBeGreaterThan(1);
    expect(plan.segments.length).toBeLessThanOrEqual(3);
    for (const segment of plan.segments) {
      expect(segment.prompt.length).toBeLessThanOrEqual(3000);
      expect(segment.estimatedDurationSeconds).toBeLessThanOrEqual(
        SEED_AUDIO_NATIVE_MAX_SECONDS,
      );
    }
    expect(plan.segments.map((segment) => segment.text).join(" ")).toContain(
      "Sentence 90",
    );
  });

  it("rebases subtitle timing across stitched segments", () => {
    const merged = mergeSeedAudioSubtitles(
      [
        {
          text: "Hello world",
          sentences: [{ startMs: 0, endMs: 900, text: "Hello world" }],
          words: [
            { startMs: 0, endMs: 400, text: "Hello" },
            { startMs: 450, endMs: 900, text: "world" },
          ],
        },
        {
          text: "Next line",
          sentences: [{ startMs: 0, endMs: 800, text: "Next line" }],
          words: [{ startMs: 0, endMs: 350, text: "Next" }],
        },
      ],
      [1, 1],
      40,
    );
    expect(merged?.sentences[1]).toEqual({
      startMs: 960,
      endMs: 1760,
      text: "Next line",
    });
    expect(merged?.words[2]?.startMs).toBe(960);
  });

  it("preserves the requested sample rate after loudness normalization", async () => {
    const result = await stitchSeedAudioSegments({
      segments: [silentWav(), silentWav()],
      format: "wav",
      sampleRate: 24_000,
      maxOutputBytes: 4 * 1024 * 1024,
    });
    expect(wavSampleRate(result.bytes)).toBe(24_000);
  });

  it("resumes from a persisted segment without resubmitting provider work", async () => {
    const checkpoint = new Map<number, SeedAudioSegmentCheckpoint>();
    let submissions = 0;
    const provider = {
      submit: async () => {
        submissions += 1;
        return {
          status: "succeeded" as const,
          providerRequestId: `provider-${submissions}`,
          inlineOutputs: [
            {
              mediaType: "audio/wav",
              dataBase64: silentWav().toString("base64"),
            },
          ],
          rawUsage: { generatedSeconds: 80 },
        };
      },
    } as unknown as MediaGenerationProvider;
    const textPrompt = Array.from(
      { length: 75 },
      (_, index) => `Sentence ${index + 1} continues the narration clearly.`,
    ).join(" ");
    const shared = {
      provider,
      idempotencyKey: "job-one",
      modelId: "seed-audio-1.0",
      baseProviderInput: {},
      textPrompt,
      estimatedDurationSeconds: 220,
      expectedMediaType: "audio/wav",
      format: "wav" as const,
      sampleRate: 24_000,
      maxOutputBytes: 4 * 1024 * 1024,
    };

    await expect(
      produceSeedAudioLongForm({
        ...shared,
        persistSegment: async (segment, value) => {
          checkpoint.set(segment.index, value);
          throw new Error("simulated worker interruption");
        },
      }),
    ).rejects.toMatchObject({ code: "LONG_FORM_CHECKPOINT_FAILED" });
    expect(submissions).toBe(1);

    await produceSeedAudioLongForm({
      ...shared,
      loadSegment: async (segment) => checkpoint.get(segment.index) ?? null,
      persistSegment: async (segment, value) => {
        checkpoint.set(segment.index, value);
      },
    });
    expect(submissions).toBeGreaterThan(1);
    expect(checkpoint.size).toBeGreaterThan(1);
  });
});
