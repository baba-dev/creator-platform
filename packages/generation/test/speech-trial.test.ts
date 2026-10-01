import { describe, expect, it, vi } from "vitest";
import {
  calculateSpeechTrialUsage,
  logSpeechTrialTelemetry,
  type SpeechTrialDbClient,
} from "../src/speech-trial";

describe("speech trial character tracking", () => {
  it("initializes with full 19,968 trial allocation when no characters are consumed", async () => {
    const mockClient: SpeechTrialDbClient = {
      generationJob: {
        aggregate: vi.fn().mockResolvedValue({
          _sum: { billableQuantity: 0, chargedCredits: 0 },
        }),
        count: vi.fn().mockResolvedValue(0),
      },
    };

    const usage = await calculateSpeechTrialUsage(mockClient);

    expect(usage.initialQuota).toBe(19_968);
    expect(usage.consumedCharacters).toBe(0);
    expect(usage.remainingCharacters).toBe(19_968);
    expect(usage.consumedPercent).toBe(0);
    expect(usage.isWarning).toBe(false);
    expect(usage.isExhausted).toBe(false);
    expect(usage.standardRateActive).toBe(true);
    expect(usage.succeededJobsCount).toBe(0);
  });

  it("calculates partial burn below the warning threshold", async () => {
    const mockClient: SpeechTrialDbClient = {
      generationJob: {
        aggregate: vi.fn().mockResolvedValue({
          _sum: { billableQuantity: 4_500, chargedCredits: 72 },
        }),
        count: vi.fn().mockResolvedValue(3),
      },
    };

    const usage = await calculateSpeechTrialUsage(mockClient);

    expect(usage.consumedCharacters).toBe(4_500);
    expect(usage.remainingCharacters).toBe(19_968 - 4_500);
    expect(usage.isWarning).toBe(false);
    expect(usage.isExhausted).toBe(false);
    expect(usage.succeededJobsCount).toBe(3);
    expect(usage.totalCreditsBilled).toBe(72);
  });

  it("flags warning threshold when 80% or more of trial characters are burned", async () => {
    const mockClient: SpeechTrialDbClient = {
      generationJob: {
        aggregate: vi.fn().mockResolvedValue({
          _sum: { billableQuantity: 16_000, chargedCredits: 256 },
        }),
        count: vi.fn().mockResolvedValue(10),
      },
    };

    const usage = await calculateSpeechTrialUsage(mockClient);

    expect(usage.consumedCharacters).toBe(16_000);
    expect(usage.remainingCharacters).toBe(3_968);
    expect(usage.isWarning).toBe(true);
    expect(usage.isExhausted).toBe(false);
    expect(usage.consumedPercent).toBeGreaterThanOrEqual(80);
  });

  it("flags exhaustion when all 19,968 trial characters have been used", async () => {
    const mockClient: SpeechTrialDbClient = {
      generationJob: {
        aggregate: vi.fn().mockResolvedValue({
          _sum: { billableQuantity: 25_000, chargedCredits: 400 },
        }),
        count: vi.fn().mockResolvedValue(15),
      },
    };

    const usage = await calculateSpeechTrialUsage(mockClient);

    expect(usage.consumedCharacters).toBe(25_000);
    expect(usage.remainingCharacters).toBe(0);
    expect(usage.isWarning).toBe(true);
    expect(usage.isExhausted).toBe(true);
    expect(usage.consumedPercent).toBe(100);
    expect(usage.estimatedCostSavedUsd).toBeCloseTo(19_968 * 0.00003, 4);
  });

  it("safely logs telemetry without throwing errors", () => {
    const usage = {
      initialQuota: 19_968,
      consumedCharacters: 16_000,
      remainingCharacters: 3_968,
      consumedPercent: 80.1,
      isWarning: true,
      isExhausted: false,
      standardRateActive: true,
      succeededJobsCount: 10,
      totalCreditsBilled: 256,
      estimatedCostSavedUsd: 0.48,
    };

    expect(() =>
      logSpeechTrialTelemetry("test-job-id", 500, usage),
    ).not.toThrow();
  });
});
