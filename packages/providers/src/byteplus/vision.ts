import { createHash, createHmac } from "node:crypto";

import { z } from "zod";

import {
  ProviderConfigurationError,
  ProviderRequestError,
  type ProviderJob,
} from "../index";
import { executeSafeFetch, sharedReadResponseText } from "../http";

const DEFAULT_VISION_BASE_URL = "https://cv.byteplusapi.com";
const VISION_SERVICE = "cv";
const VISION_REGION = "ap-singapore-1";
const VISION_VERSION = "2024-06-06";
const OMNIHUMAN_REQ_KEY = "realman_avatar_picture_omni15_cv";
const OMNIHUMAN_REQUEST_PREFIX = "vision:omnihuman:";
const MAX_RESPONSE_BYTES = 1024 * 1024;

export interface BytePlusVisionConfig {
  accessKeyId?: string;
  secretAccessKey?: string;
  baseUrl?: string;
  requestTimeoutMs: number;
  idleTimeoutMs?: number;
  fetch: typeof globalThis.fetch;
}

interface OmniHumanVisionInput {
  workflow: string;
  prompt: string;
  sources: readonly { role: string; url: string }[];
  resolution: string;
  seed?: number;
}

const visionEnvelopeSchema = z
  .object({
    code: z.coerce.number().int(),
    message: z.string().optional(),
    request_id: z.string().optional(),
    data: z.unknown().nullable().optional(),
  })
  .passthrough();

const submitDataSchema = z.object({
  task_id: z.string().min(1).max(200),
});

const resultDataSchema = z.object({
  status: z.enum([
    "in_queue",
    "generating",
    "done",
    "not_found",
    "expired",
    "canceled",
  ]),
  resp_data: z
    .union([z.string(), z.record(z.string(), z.unknown())])
    .optional(),
});

const resultPayloadSchema = z
  .object({
    video_url: z
      .url()
      .refine(
        (value) => new URL(value).protocol === "https:",
        "HTTPS URL required",
      )
      .optional(),
  })
  .passthrough();

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function signingKey(
  secretAccessKey: string,
  shortDate: string,
  region: string,
  service: string,
): Buffer {
  const dateKey = hmac(secretAccessKey, shortDate);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, service);
  return hmac(serviceKey, "request");
}

function bytePlusDate(now: Date): { xDate: string; shortDate: string } {
  const xDate = now
    .toISOString()
    .replace(/[:-]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  return { xDate, shortDate: xDate.slice(0, 8) };
}

export function createVisionAuthorizationHeaders(input: {
  accessKeyId: string;
  secretAccessKey: string;
  url: URL;
  body: string;
  now?: Date;
}): Record<string, string> {
  const { xDate, shortDate } = bytePlusDate(input.now ?? new Date());
  const payloadHash = sha256Hex(input.body);
  const query = [...input.url.searchParams.entries()]
    .sort(([aKey, aValue], [bKey, bValue]) =>
      aKey === bKey ? aValue.localeCompare(bValue) : aKey.localeCompare(bKey),
    )
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join("&");
  const signedHeaders = "host;x-content-sha256;x-date";
  const canonicalHeaders =
    [
      `host:${input.url.host.toLowerCase()}`,
      `x-content-sha256:${payloadHash}`,
      `x-date:${xDate}`,
    ].join("\n") + "\n";
  const canonicalRequest = [
    "POST",
    input.url.pathname || "/",
    query,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${shortDate}/${VISION_REGION}/${VISION_SERVICE}/request`;
  const stringToSign = [
    "HMAC-SHA256",
    xDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = createHmac(
    "sha256",
    signingKey(input.secretAccessKey, shortDate, VISION_REGION, VISION_SERVICE),
  )
    .update(stringToSign, "utf8")
    .digest("hex");

  return {
    "content-type": "application/json",
    "x-content-sha256": payloadHash,
    "x-date": xDate,
    authorization:
      `HMAC-SHA256 Credential=${input.accessKeyId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

function configuredVision(
  config: BytePlusVisionConfig,
): asserts config is BytePlusVisionConfig & {
  accessKeyId: string;
  secretAccessKey: string;
} {
  if (!config.accessKeyId || !config.secretAccessKey) {
    throw new ProviderConfigurationError(
      "BytePlus Vision AK/SK credentials are required for OmniHuman 1.5",
    );
  }
}

function retryableBusinessCode(code: number): boolean {
  return [50429, 50430, 50500, 50501].includes(code);
}

function businessError(code: number): ProviderRequestError {
  return new ProviderRequestError(
    `BytePlus Vision request failed (${code})`,
    retryableBusinessCode(code),
    { code: `VISION_${code}` },
  );
}

async function visionRequest(
  config: BytePlusVisionConfig,
  action: "CVSubmitTask" | "CVGetResult" | "CVCancelTask",
  payload: Record<string, unknown>,
): Promise<z.infer<typeof visionEnvelopeSchema>> {
  configuredVision(config);
  const body = JSON.stringify(payload);
  const url = new URL(config.baseUrl ?? DEFAULT_VISION_BASE_URL);
  url.search = "";
  url.searchParams.set("Action", action);
  url.searchParams.set("Version", VISION_VERSION);
  const headers = createVisionAuthorizationHeaders({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    url,
    body,
  });

  const response = await executeSafeFetch(
    config.fetch,
    url.toString(),
    { method: "POST", headers, body },
    {
      timeoutMs: config.requestTimeoutMs,
      idleTimeoutMs: config.idleTimeoutMs,
      defaultIdleTimeoutMs: 30_000,
      providerName: "BytePlus",
      onAbortCode: "REQUEST_TIMEOUT",
      onAbortRetryable: true,
      onNetworkErrorCode: "NETWORK_ERROR",
    },
  );

  let raw = "";
  try {
    raw = await sharedReadResponseText(response, MAX_RESPONSE_BYTES, {
      providerName: "BytePlus",
      onAbortCode: "REQUEST_TIMEOUT",
      onAbortRetryable: true,
      onNetworkErrorCode: "NETWORK_ERROR",
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      "BytePlus Vision response could not be read",
      true,
      { cause: error, code: "INVALID_PROVIDER_RESPONSE" },
    );
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new ProviderRequestError(
      "BytePlus Vision returned invalid JSON",
      response.status >= 500,
      { cause: error, code: "INVALID_PROVIDER_RESPONSE" },
    );
  }

  const parsed = visionEnvelopeSchema.safeParse(value);
  if (!parsed.success) {
    throw new ProviderRequestError(
      "BytePlus Vision returned an invalid response shape",
      response.status >= 500,
      { code: "INVALID_PROVIDER_RESPONSE" },
    );
  }
  if (!response.ok && parsed.data.code === 10000) {
    throw new ProviderRequestError(
      `BytePlus Vision request failed with status ${response.status}`,
      response.status === 408 ||
        response.status === 429 ||
        response.status >= 500,
      { code: `HTTP_${response.status}` },
    );
  }
  if (parsed.data.code !== 10000) throw businessError(parsed.data.code);
  return parsed.data;
}

function parseVisionTaskId(providerRequestId: string): string {
  if (!providerRequestId.startsWith(OMNIHUMAN_REQUEST_PREFIX)) {
    throw new ProviderRequestError(
      "Invalid OmniHuman provider request identifier",
      false,
      { code: "INVALID_INPUT" },
    );
  }
  const taskId = providerRequestId.slice(OMNIHUMAN_REQUEST_PREFIX.length);
  if (!/^[A-Za-z0-9._-]{1,200}$/.test(taskId)) {
    throw new ProviderRequestError(
      "Invalid OmniHuman provider request identifier",
      false,
      { code: "INVALID_INPUT" },
    );
  }
  return taskId;
}

export function isOmniHumanVisionRequestId(value: string): boolean {
  return value.startsWith(OMNIHUMAN_REQUEST_PREFIX);
}

export async function submitOmniHumanVisionTask(
  config: BytePlusVisionConfig,
  input: OmniHumanVisionInput,
): Promise<ProviderJob> {
  if (input.workflow !== "TALKING_AVATAR") {
    throw new ProviderRequestError(
      "OmniHuman 1.5 requires the talking-avatar workflow",
      false,
      { code: "INVALID_INPUT" },
    );
  }
  const avatar = input.sources.find((source) => source.role === "AVATAR_IMAGE");
  const audio = input.sources.find((source) => source.role === "DRIVING_AUDIO");
  if (!avatar || !audio || input.sources.length !== 2) {
    throw new ProviderRequestError(
      "OmniHuman requires one avatar image and one driving audio source",
      false,
      { code: "INVALID_INPUT" },
    );
  }
  if (input.resolution !== "720p" && input.resolution !== "1080p") {
    throw new ProviderRequestError(
      "OmniHuman supports 720p or 1080p output",
      false,
      { code: "INVALID_INPUT" },
    );
  }

  const response = await visionRequest(config, "CVSubmitTask", {
    req_key: OMNIHUMAN_REQ_KEY,
    image_url: avatar.url,
    audio_url: audio.url,
    output_resolution: input.resolution === "720p" ? 720 : 1080,
    ...(input.prompt.trim() ? { prompt: input.prompt.trim() } : {}),
    ...(input.seed === undefined ? {} : { seed: input.seed }),
  });
  const data = submitDataSchema.safeParse(response.data);
  if (!data.success) {
    throw new ProviderRequestError(
      "BytePlus Vision did not return an OmniHuman task identifier",
      true,
      { code: "INVALID_PROVIDER_RESPONSE" },
    );
  }
  return {
    providerRequestId: `${OMNIHUMAN_REQUEST_PREFIX}${data.data.task_id}`,
    status: "submitted",
  };
}

export async function getOmniHumanVisionJob(
  config: BytePlusVisionConfig,
  providerRequestId: string,
): Promise<ProviderJob> {
  const taskId = parseVisionTaskId(providerRequestId);
  const response = await visionRequest(config, "CVGetResult", {
    req_key: OMNIHUMAN_REQ_KEY,
    task_id: taskId,
  });
  const data = resultDataSchema.safeParse(response.data);
  if (!data.success) {
    throw new ProviderRequestError(
      "BytePlus Vision returned an invalid OmniHuman task result",
      true,
      { code: "INVALID_PROVIDER_RESPONSE" },
    );
  }

  if (data.data.status === "in_queue") {
    return { providerRequestId, status: "submitted" };
  }
  if (data.data.status === "generating") {
    return { providerRequestId, status: "processing" };
  }
  if (data.data.status === "canceled") {
    return {
      providerRequestId,
      status: "cancelled",
      errorCode: "PROVIDER_CANCELLED",
    };
  }
  if (data.data.status === "not_found" || data.data.status === "expired") {
    return {
      providerRequestId,
      status: "failed",
      errorCode:
        data.data.status === "expired" ? "TASK_EXPIRED" : "TASK_NOT_FOUND",
    };
  }

  let resultValue: unknown = data.data.resp_data;
  if (typeof resultValue === "string") {
    try {
      resultValue = JSON.parse(resultValue);
    } catch (error) {
      throw new ProviderRequestError(
        "BytePlus Vision returned invalid OmniHuman output metadata",
        true,
        { cause: error, code: "INVALID_PROVIDER_RESPONSE" },
      );
    }
  }
  const result = resultPayloadSchema.safeParse(resultValue);
  if (!result.success || !result.data.video_url) {
    throw new ProviderRequestError(
      "BytePlus Vision completed without a video output",
      true,
      { code: "INVALID_PROVIDER_RESPONSE" },
    );
  }
  return {
    providerRequestId,
    status: "succeeded",
    outputUrls: [result.data.video_url],
  };
}

export async function cancelOmniHumanVisionJob(
  config: BytePlusVisionConfig,
  providerRequestId: string,
): Promise<void> {
  const taskId = parseVisionTaskId(providerRequestId);
  await visionRequest(config, "CVCancelTask", {
    req_key: OMNIHUMAN_REQ_KEY,
    task_id: taskId,
  });
}
