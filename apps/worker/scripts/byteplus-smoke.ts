import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { serverEnvSchema } from "@aiwa/config";
import { createBytePlusProvider } from "@aiwa/providers/byteplus";

const smokeEnvSchema = serverEnvSchema.pick({
  BYTEPLUS_LIVE_SMOKE_ACK: true,
  BYTEPLUS_API_KEY: true,
  BYTEPLUS_REGION: true,
  BYTEPLUS_MODELARK_BASE_URL: true,
  BYTEPLUS_SMOKE_PROMPT: true,
});

const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;

async function readImageWithLimit(response: Response): Promise<Uint8Array> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const declaredLength = Number(contentLength);
    if (
      !Number.isSafeInteger(declaredLength) ||
      declaredLength <= 0 ||
      declaredLength > MAX_DOWNLOAD_BYTES
    ) {
      throw new Error("Generated image declared an invalid size");
    }
  }
  if (!response.body) throw new Error("Generated image had no response body");

  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    totalBytes += next.value.byteLength;
    if (totalBytes > MAX_DOWNLOAD_BYTES) {
      await reader.cancel();
      throw new Error("Generated image exceeded the smoke-test size limit");
    }
    parts.push(next.value);
  }
  if (totalBytes === 0) throw new Error("Generated image was empty");

  const result = new Uint8Array(totalBytes);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

async function main(): Promise<void> {
  const parsed = smokeEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      "Live smoke configuration is invalid; copy .env.example, set BYTEPLUS_API_KEY, and acknowledge billing",
    );
  }
  const env = parsed.data;
  if (
    env.BYTEPLUS_LIVE_SMOKE_ACK !== "I_UNDERSTAND_THIS_IS_BILLABLE" ||
    !env.BYTEPLUS_API_KEY
  ) {
    throw new Error(
      "Live smoke execution requires the BytePlus key and billing acknowledgement",
    );
  }
  const provider = createBytePlusProvider({
    apiKey: env.BYTEPLUS_API_KEY,
    region: env.BYTEPLUS_REGION,
    modelArkBaseUrl: env.BYTEPLUS_MODELARK_BASE_URL,
  });

  const job = await provider.submit({
    idempotencyKey: randomUUID(),
    modelId: "seedream-5-0-260128",
    mediaKind: "image",
    input: {
      prompt:
        env.BYTEPLUS_SMOKE_PROMPT ??
        "A refined editorial still life with warm natural light, no text, high detail",
      aspectRatio: "1:1",
      resolution: "2K",
      outputFormat: "png",
      watermark: false,
    },
  });
  const outputUrl = job.outputUrls?.[0];
  if (!outputUrl)
    throw new Error("BytePlus smoke generation returned no image");

  const response = await fetch(outputUrl, {
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error("Generated image download failed");
  if (new URL(response.url).protocol !== "https:") {
    throw new Error("Generated image redirected to an insecure URL");
  }
  const contentType = response.headers.get("content-type")?.split(";")[0];
  if (contentType !== "image/png") {
    throw new Error("Generated output was not a PNG image");
  }
  const bytes = await readImageWithLimit(response);

  const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
  const outputDirectory = `${repositoryRoot}/.data/byteplus-smoke`;
  const outputPath = `${outputDirectory}/${new Date().toISOString().replaceAll(":", "-")}.png`;
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, bytes, { flag: "wx", mode: 0o600 });

  console.info(
    JSON.stringify({
      status: "succeeded",
      providerRequestId: job.providerRequestId,
      outputPath,
      outputBytes: bytes.byteLength,
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
