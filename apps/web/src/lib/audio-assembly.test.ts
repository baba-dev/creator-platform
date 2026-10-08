import { describe, expect, it } from "vitest";
import {
  audioAssemblyFitsBudget,
  MAX_AUDIO_ASSEMBLY_WORKING_BYTES,
} from "./audio-assembly";

describe("audio assembly budget", () => {
  it("rejects a clip before cumulative decoded and output memory exceeds the limit", () => {
    expect(
      audioAssemblyFitsBudget({
        downloadedBytes: 30 * 1024 * 1024,
        decodedBytes: 55 * 1024 * 1024,
        decodedSamples: 5_000_000,
        clipDownloadBytes: 10 * 1024 * 1024,
        clipDecodedBytes: 20 * 1024 * 1024,
        clipSamples: 2_000_000,
        existingClipCount: 4,
        pauseSamples: 44_100,
        sampleRate: 44_100,
      }),
    ).toBe(false);
  });

  it("accepts a small multi-clip working set", () => {
    expect(MAX_AUDIO_ASSEMBLY_WORKING_BYTES).toBeGreaterThan(0);
    expect(
      audioAssemblyFitsBudget({
        downloadedBytes: 1_000_000,
        decodedBytes: 4_000_000,
        decodedSamples: 500_000,
        clipDownloadBytes: 500_000,
        clipDecodedBytes: 2_000_000,
        clipSamples: 250_000,
        existingClipCount: 1,
        pauseSamples: 44_100,
        sampleRate: 44_100,
      }),
    ).toBe(true);
  });
});
