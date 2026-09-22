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
  BYTEPLUS_SPEECH_APP_ID: true,
  BYTEPLUS_SPEECH_ACCESS_TOKEN: true,
  BYTEPLUS_SMOKE_OUTPUT_DIR: true,
  BYTEPLUS_SMOKE_PROMPT: true,
});

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
    (!env.BYTEPLUS_SPEECH_API_KEY &&
      (!env.BYTEPLUS_SPEECH_APP_ID || !env.BYTEPLUS_SPEECH_ACCESS_TOKEN))
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
    speechAppId: env.BYTEPLUS_SPEECH_APP_ID,
    speechAccessToken: env.BYTEPLUS_SPEECH_ACCESS_TOKEN,
  });

  const job = await provider.submit({
    idempotencyKey: randomUUID(),
    modelId: "seed-tts-2.0",
    mediaKind: "voice",
    input: {
      text:
        env.BYTEPLUS_SMOKE_PROMPT ??
        "Welcome to Aiwa Creator. Production text to speech generation is operational.",
      speaker: "en_female_charlotte",
      speedRatio: 1.0,
      volumeRatio: 1.0,
      pitchRatio: 1.0,
    },
  });

  const inline = job.inlineOutputs?.[0];
  const audioBytes = inline
    ? Buffer.from(inline.dataBase64, "base64")
    : undefined;
  if (!audioBytes || audioBytes.byteLength === 0) {
    throw new Error("BytePlus voice smoke generation returned no audio bytes");
  }

  validateMp3Bytes(audioBytes);

  const outputDirectory =
    env.BYTEPLUS_SMOKE_OUTPUT_DIR ??
    resolve(process.cwd(), "../..", ".data/byteplus-smoke");
  const outputPath = `${outputDirectory}/${new Date().toISOString().replaceAll(":", "-")}.mp3`;
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, audioBytes, { flag: "wx", mode: 0o600 });

  console.info(
    JSON.stringify({
      status: "succeeded",
      providerRequestId: job.providerRequestId,
      outputPath,
      outputBytes: audioBytes.byteLength,
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
