import { db, type Prisma } from "@aiwa/db";
import { createLogger } from "@aiwa/observability";

const logger = createLogger({
  service: "generation",
  version: "1.0.0",
});

export const BYTEPLUS_SPEECH_TRIAL_CONFIG = {
  MODEL_ID: "seed-tts-2.0",
  INITIAL_TRIAL_CHARACTERS: 19_968,
  WARNING_THRESHOLD_PERCENT: 80, // 80% = 15,974 chars
} as const;

export interface SpeechTrialUsage {
  initialQuota: number;
  consumedCharacters: number;
  remainingCharacters: number;
  consumedPercent: number;
  isWarning: boolean;
  isExhausted: boolean;
  standardRateActive: boolean;
  succeededJobsCount: number;
  totalCreditsBilled: number;
  estimatedCostSavedUsd: number;
}

export interface SpeechTrialDbClient {
  generationJob: {
    aggregate: (args: {
      where: {
        providerModel: {
          providerModelId: string;
        };
        status: string;
      };
      _sum: {
        billableQuantity: true;
        reservedCredits: true;
      };
    }) => Promise<{
      _sum: {
        billableQuantity: number | bigint | null;
        reservedCredits: number | bigint | null;
      };
    }>;
    count: (args: {
      where: {
        providerModel: {
          providerModelId: string;
        };
        status: string;
      };
    }) => Promise<number>;
  };
}

/**
 * Calculates internal usage against the 19,968 trial character allocation for BytePlus Seed Speech TTS 2.0.
 * Customers are billed at standard rates (16 credits per 1,000 characters), while this telemetry tracks
 * the provider subsidy consumption and flags exhaustion thresholds.
 */
export async function calculateSpeechTrialUsage(
  client: SpeechTrialDbClient | Prisma.TransactionClient | typeof db = db,
): Promise<SpeechTrialUsage> {
  const [aggregateResult, countResult] = await Promise.all([
    client.generationJob.aggregate({
      where: {
        providerModel: {
          providerModelId: BYTEPLUS_SPEECH_TRIAL_CONFIG.MODEL_ID,
        },
        status: "SUCCEEDED",
      },
      _sum: {
        billableQuantity: true,
        reservedCredits: true,
      },
    }),
    client.generationJob.count({
      where: {
        providerModel: {
          providerModelId: BYTEPLUS_SPEECH_TRIAL_CONFIG.MODEL_ID,
        },
        status: "SUCCEEDED",
      },
    }),
  ]);

  const consumedCharacters = Number(
    aggregateResult._sum?.billableQuantity ?? 0,
  );
  const totalCreditsBilled = Number(aggregateResult._sum?.reservedCredits ?? 0);
  const initialQuota = BYTEPLUS_SPEECH_TRIAL_CONFIG.INITIAL_TRIAL_CHARACTERS;
  const remainingCharacters = Math.max(0, initialQuota - consumedCharacters);
  const consumedPercent = Number(
    Math.min(100, (consumedCharacters / initialQuota) * 100).toFixed(1),
  );
  const warningThreshold = Math.floor(
    (initialQuota * BYTEPLUS_SPEECH_TRIAL_CONFIG.WARNING_THRESHOLD_PERCENT) /
      100,
  );
  const isWarning = consumedCharacters >= warningThreshold;
  const isExhausted = consumedCharacters >= initialQuota;
  const trialCharsUsed = Math.min(consumedCharacters, initialQuota);
  const estimatedCostSavedUsd = Number((trialCharsUsed * 0.00003).toFixed(4));

  return {
    initialQuota,
    consumedCharacters,
    remainingCharacters,
    consumedPercent,
    isWarning,
    isExhausted,
    standardRateActive: true,
    succeededJobsCount: countResult,
    totalCreditsBilled,
    estimatedCostSavedUsd,
  };
}

/**
 * Emits structured telemetry when a voice generation job completes, auditing trial consumption.
 */
export function logSpeechTrialTelemetry(
  jobId: string,
  billableCharacters: number,
  usage: SpeechTrialUsage,
) {
  logger.info("Speech trial character consumption recorded", {
    jobId,
    billableCharacters,
    consumedCharacters: usage.consumedCharacters,
    remainingCharacters: usage.remainingCharacters,
    consumedPercent: usage.consumedPercent,
    isWarning: usage.isWarning,
    isExhausted: usage.isExhausted,
  });

  if (usage.isExhausted) {
    logger.warn(
      "BytePlus Speech trial allocation exhausted; live billing active",
      {
        jobId,
        consumedCharacters: usage.consumedCharacters,
        initialQuota: usage.initialQuota,
      },
    );
  } else if (usage.isWarning) {
    logger.warn("BytePlus Speech trial allocation near exhaustion (>80%)", {
      jobId,
      remainingCharacters: usage.remainingCharacters,
      consumedPercent: usage.consumedPercent,
    });
  }
}
