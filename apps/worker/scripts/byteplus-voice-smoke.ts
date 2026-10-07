import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { serverEnvSchema } from "@aiwa/config";
import { validateMp3Bytes } from "@aiwa/generation/storage";
import { createBytePlusProvider } from "@aiwa/providers/byteplus";

const smokeEnvSchema = serverEnvSchema.pick({
  BYTEPLUS_LIVE_SMOKE_ACK: true,
  BYTEPLUS_REGION: true,
  BYTEPLUS_SPEECH_API_KEY: true,
  BYTEPLUS_SPEECH_APP_KEY: true,
  BYTEPLUS_SPEECH_BASE_URL: true,
  BYTEPLUS_SMOKE_OUTPUT_DIR: true,
  BYTEPLUS_SMOKE_PROMPT: true,
});

const DEFAULT_PROMPT =
  "Aiwa Creator turns an idea into polished media. This sample checks clarity, natural pacing, and professional narration quality.";
const RUSSELL_SPEAKER = "en_male_russell_uranus_bigtts";
const PRODUCTION_STYLE =
  "Speak naturally with a warm, confident professional narration style, clear diction, and measured pauses.";

async function main(): Promise<void> {
  const parsed = smokeEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      "Live smoke configuration is invalid; copy .env.example, set BYTEPLUS_SPEECH_API_KEY, and acknowledge billing",
    );
  }
  const env = parsed.data;
  if (
    env.BYTEPLUS_LIVE_SMOKE_ACK !== "I_UNDERSTAND_THIS_IS_BILLABLE" ||
    !env.BYTEPLUS_SPEECH_API_KEY
  ) {
    throw new Error(
      "Live voice smoke execution requires BytePlus speech credentials and billing acknowledgement",
    );
  }

  const provider = createBytePlusProvider({
    region: env.BYTEPLUS_REGION,
    speechApiKey: env.BYTEPLUS_SPEECH_API_KEY,
    speechAppKey: env.BYTEPLUS_SPEECH_APP_KEY,
    speechBaseUrl: env.BYTEPLUS_SPEECH_BASE_URL,
  });
  const outputDirectory =
    env.BYTEPLUS_SMOKE_OUTPUT_DIR ??
    resolve(process.cwd(), "../..", ".data/byteplus-smoke");
  await mkdir(outputDirectory, { recursive: true });

  const prompt = env.BYTEPLUS_SMOKE_PROMPT ?? DEFAULT_PROMPT;
  const runAb = process.argv.includes("--ab");
  const variants = runAb
    ? [
        {
          label: "A-legacy-provider-default",
          input: {
            text: prompt,
            speaker: RUSSELL_SPEAKER,
            format: "mp3" as const,
            speechRate: 1,
            qualityProfile: "provider-default" as const,
          },
        },
        {
          label: "B-production-128k-expression",
          input: {
            text: prompt,
            speaker: RUSSELL_SPEAKER,
            format: "mp3" as const,
            speechRate: 1,
            bitRate: 128_000,
            stylePrompt: PRODUCTION_STYLE,
          },
        },
      ]
    : [
        {
          label: "production-128k",
          input: {
            text: prompt,
            speaker: RUSSELL_SPEAKER,
            format: "mp3" as const,
            speechRate: 1,
            bitRate: 128_000,
          },
        },
      ];

  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const results: Array<Record<string, unknown>> = [];

  for (const variant of variants) {
    const job = await provider.submit({
      idempotencyKey: randomUUID(),
      modelId: "seed-tts-2.0",
      mediaKind: "voice",
      input: variant.input,
    });
    const inline = job.inlineOutputs?.[0];
    const audioBytes = inline
      ? Buffer.from(inline.dataBase64, "base64")
      : undefined;
    if (!audioBytes || audioBytes.byteLength === 0) {
      throw new Error(
        `BytePlus voice smoke generation returned no audio bytes for ${variant.label}`,
      );
    }

    validateMp3Bytes(audioBytes);
    const outputPath = `${outputDirectory}/${timestamp}-${variant.label}.mp3`;
    await writeFile(outputPath, audioBytes, { flag: "wx", mode: 0o600 });
    results.push({
      label: variant.label,
      providerRequestId: job.providerRequestId,
      outputPath,
      outputBytes: audioBytes.byteLength,
    });
  }

  const manifestPath = `${outputDirectory}/${timestamp}-manifest.json`;
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        status: "succeeded",
        comparison: runAb ? "legacy-vs-production" : "production",
        speaker: "Russell",
        prompt,
        production: {
          format: "mp3",
          sampleRate: 24_000,
          bitRate: 128_000,
          stylePrompt: runAb ? PRODUCTION_STYLE : null,
        },
        results,
      },
      null,
      2,
    ),
    { flag: "wx", mode: 0o600 },
  );

  console.info(
    JSON.stringify({
      status: "succeeded",
      comparison: runAb ? "legacy-vs-production" : "production",
      manifestPath,
      results,
    }),
  );
}

void main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      status: "failed",
      errorName: error instanceof Error ? error.name : "UnknownError",
    }),
  );
  process.exitCode = 1;
});
