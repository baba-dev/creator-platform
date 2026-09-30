import { z } from "zod";

const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.url().optional(),
);

const optionalHttpsUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z
    .url()
    .refine((url) => new URL(url).protocol === "https:", "HTTPS URL required")
    .optional(),
);

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const optionalAbsolutePath = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().startsWith("/", "Absolute path required").optional(),
);

const optionalPositiveInteger = z.preprocess(
  (value) => (value === "" || value === undefined ? undefined : value),
  z.coerce.number().int().positive().max(600_000).optional(),
);

const optionalSmokeAcknowledgement = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.literal("I_UNDERSTAND_THIS_IS_BILLABLE").optional(),
);

const booleanFromString = z
  .enum(["true", "false"])
  .default("true")
  .transform((value) => value === "true");

export const mediaEnvSchema = z.object({
  MEDIA_PROCESSING_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  MEDIA_THREADS: z.coerce.number().int().min(1).max(2).default(1),
  MEDIA_DERIVATIVE_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(15_000)
    .max(120_000)
    .default(60_000),
});

export function parseMediaEnv(environment: NodeJS.ProcessEnv = process.env) {
  return mediaEnvSchema.parse(environment);
}

export const serverEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  APP_ENV: z.enum(["local", "staging", "production"]).default("local"),
  APP_VERSION: z.string().min(1).default("dev"),
  APP_URL: z.url().default("http://localhost:3000"),
  AUTH_SECRET: z.string().min(32),
  SIGNUPS_ENABLED: booleanFromString,
  MAIL_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  SMTP_HOST: z.string().min(1).default("localhost"),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(465),
  SMTP_USER: z.string().min(1).default("local"),
  SMTP_PASSWORD: z.string().min(1).default("local"),
  ROUTINE_USER: optionalString,
  ROUTINE_USER_PASSWORD: optionalString,
  SMTP_EHLO_NAME: z.string().min(1).default("creator.aiwamediagroup.com"),
  SMTP_POOL_MAX_CONNECTIONS: z.coerce.number().int().min(1).max(20).default(3),
  SMTP_POOL_MAX_MESSAGES: z.coerce.number().int().min(1).max(1000).default(100),
  SMTP_CONNECTION_TIMEOUT_MS: optionalPositiveInteger.default(10_000),
  SMTP_GREETING_TIMEOUT_MS: optionalPositiveInteger.default(10_000),
  SMTP_SOCKET_TIMEOUT_MS: optionalPositiveInteger.default(30_000),
  MAIL_SECURITY_FROM_ADDRESS: z
    .string()
    .email()
    .default("security@aiwamediagroup.com"),
  MAIL_ROUTINE_FROM_ADDRESS: z
    .string()
    .email()
    .default("creator-tool@aiwamediagroup.com"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.url().default("redis://127.0.0.1:6379/0"),
  GENERATION_WORKER_CONCURRENCY: z.coerce
    .number()
    .int()
    .min(1)
    .max(10)
    .default(3),
  ...mediaEnvSchema.shape,
  ASSET_STORAGE_ROOT: optionalAbsolutePath.default(
    "/var/www/creator-platform/shared/assets",
  ),
  BYTEPLUS_API_KEY: optionalString,
  BYTEPLUS_REGION: z
    .enum(["ap-southeast-1", "eu-west-1"])
    .default("ap-southeast-1"),
  BYTEPLUS_MODELARK_BASE_URL: optionalHttpsUrl,
  BYTEPLUS_SPEECH_API_KEY: optionalString,
  BYTEPLUS_SPEECH_APP_KEY: optionalString,
  BYTEPLUS_SPEECH_BASE_URL: optionalHttpsUrl,
  BYTEPLUS_REQUEST_TIMEOUT_MS: optionalPositiveInteger,
  BYTEPLUS_IDLE_TIMEOUT_MS: optionalPositiveInteger,
  BYTEPLUS_LIVE_SMOKE_ACK: optionalSmokeAcknowledgement,
  BYTEPLUS_SMOKE_OUTPUT_DIR: optionalAbsolutePath,
  BYTEPLUS_SMOKE_PROMPT: optionalString,
  NVIDIA_API_KEY: optionalString,
  NVIDIA_BASE_URL: z.url().default("https://integrate.api.nvidia.com/v1"),
  NVIDIA_REASONING_MODEL: optionalString,
  NVIDIA_REQUEST_TIMEOUT_MS: optionalPositiveInteger,
  NVIDIA_IDLE_TIMEOUT_MS: optionalPositiveInteger,
  S3_ENDPOINT: optionalUrl,
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_BUCKET: optionalString,
  S3_ACCESS_KEY_ID: optionalString,
  S3_SECRET_ACCESS_KEY: optionalString,
  S3_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  OTEL_EXPORTER_OTLP_ENDPOINT: optionalUrl,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(
  environment: NodeJS.ProcessEnv = process.env,
): ServerEnv {
  const result = serverEnvSchema.safeParse(environment);

  if (!result.success) {
    const fields = result.error.issues
      .map((issue) => issue.path.join("."))
      .filter(Boolean)
      .join(", ");

    throw new Error(`Invalid server environment variables: ${fields}`);
  }

  if (
    Boolean(result.data.ROUTINE_USER) !==
    Boolean(result.data.ROUTINE_USER_PASSWORD)
  ) {
    throw new Error(
      "Invalid server environment variables: ROUTINE_USER, ROUTINE_USER_PASSWORD must be configured together",
    );
  }

  if (result.data.APP_ENV === "production" && result.data.MAIL_ENABLED) {
    const requiredMailVariables = [
      "SMTP_HOST",
      "SMTP_USER",
      "SMTP_PASSWORD",
      "MAIL_SECURITY_FROM_ADDRESS",
      "MAIL_ROUTINE_FROM_ADDRESS",
    ] as const;
    const missing = requiredMailVariables.filter(
      (key) => !environment[key]?.trim(),
    );
    if (missing.length) {
      throw new Error(
        `Invalid server environment variables: ${missing.join(", ")}`,
      );
    }
    if (result.data.SMTP_PORT !== 465) {
      throw new Error(
        "Invalid server environment variables: SMTP_PORT (implicit TLS on port 465 is required in production)",
      );
    }
  }

  if (result.data.APP_ENV === "production") {
    let parsedAppUrl: URL;
    try {
      parsedAppUrl = new URL(result.data.APP_URL);
    } catch {
      throw new Error(
        "Invalid server environment variables: APP_URL (must be a valid URL)",
      );
    }

    const appHost = parsedAppUrl.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    const isAppLoopback =
      appHost === "127.0.0.1" ||
      appHost === "localhost" ||
      appHost === "::1" ||
      appHost === "0.0.0.0";

    if (parsedAppUrl.protocol !== "https:" || isAppLoopback) {
      throw new Error(
        "Invalid server environment variables: APP_URL (HTTPS and non-localhost URL are required in production)",
      );
    }

    try {
      const redisUrl = new URL(result.data.REDIS_URL);
      if (redisUrl.protocol !== "redis:" && redisUrl.protocol !== "rediss:") {
        throw new Error(
          "Invalid server environment variables: REDIS_URL (must use redis:// or rediss:// protocol)",
        );
      }

      const redisHost = redisUrl.hostname.toLowerCase().replace(/^\[|\]$/g, "");
      const isRedisLoopback =
        redisHost === "127.0.0.1" ||
        redisHost === "localhost" ||
        redisHost === "::1";

      if (!isRedisLoopback && !redisUrl.password) {
        throw new Error(
          "Invalid server environment variables: REDIS_URL (authentication is required for non-loopback Redis in production)",
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("REDIS_URL"))
        throw error;
      throw new Error(
        "Invalid server environment variables: REDIS_URL (must be a valid Redis connection URL)",
      );
    }
  }

  if (
    result.data.MAIL_ENABLED &&
    result.data.APP_ENV !== "local" &&
    environment.SMTP_HOST?.trim() &&
    (!result.data.ROUTINE_USER || !result.data.ROUTINE_USER_PASSWORD)
  ) {
    throw new Error(
      "Invalid server environment variables: ROUTINE_USER, ROUTINE_USER_PASSWORD",
    );
  }

  return result.data;
}
