import { describe, expect, it } from "vitest";
import {
  mergeSeedAudioSubtitles,
  planSeedAudioLongForm,
  SEED_AUDIO_NATIVE_MAX_SECONDS,
} from "../src/seed-audio-long-form";

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
});
