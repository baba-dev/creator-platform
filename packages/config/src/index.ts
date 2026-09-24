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

  return result.data;
}
