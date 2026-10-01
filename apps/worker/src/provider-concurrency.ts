import type Redis from "ioredis";

const PROVIDER_LEASE_TTL_MS = 60 * 60 * 1000;

export interface ProviderConcurrencySpec {
  key: string;
  limit: number;
}

function capabilityLimit(
  raw: unknown,
  key: string,
  fallback: number,
): number {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fallback;
  const value = (raw as Record<string, unknown>)[key];
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= 100
    ? value
    : fallback;
}

/**
 * Reserve some provider headroom so staging/manual calls do not make the
 * worker sit exactly on the account's hard concurrency ceiling.
 */
function operatingLimit(providerLimit: number): number {
  return providerLimit <= 1 ? 1 : Math.max(1, Math.floor(providerLimit * 0.8));
}

export function seedanceConcurrencySpec(input: {
  providerModelId: string;
  capabilities: unknown;
  requestPayload: unknown;
}): ProviderConcurrencySpec | null {
  if (!input.providerModelId.startsWith("dreamina-seedance-2-")) return null;
  const payload =
    input.requestPayload &&
    typeof input.requestPayload === "object" &&
    !Array.isArray(input.requestPayload)
      ? (input.requestPayload as Record<string, unknown>)
      : {};
  const is4k =
    input.providerModelId === "dreamina-seedance-2-0-260128" &&
    payload.resolution === "4K";
  const providerLimit = is4k
    ? capabilityLimit(input.capabilities, "concurrencyLimit4K", 1)
    : capabilityLimit(input.capabilities, "concurrencyLimit", 10);
  return {
    key: `aiwa:provider-capacity:byteplus:${input.providerModelId}:${
      is4k ? "4k" : "standard"
    }`,
    limit: operatingLimit(providerLimit),
  };
}

const ACQUIRE_SCRIPT = `
local key = KEYS[1]
local member = ARGV[1]
local now = tonumber(ARGV[2])
local expires = tonumber(ARGV[3])
local limit = tonumber(ARGV[4])
redis.call("ZREMRANGEBYSCORE", key, "-inf", now)
if redis.call("ZSCORE", key, member) then
  redis.call("ZADD", key, expires, member)
  redis.call("PEXPIRE", key, expires - now + 60000)
  return 1
end
if redis.call("ZCARD", key) >= limit then
  return 0
end
redis.call("ZADD", key, expires, member)
redis.call("PEXPIRE", key, expires - now + 60000)
return 1
`;

export async function acquireProviderLease(
  redis: Redis,
  spec: ProviderConcurrencySpec,
  jobId: string,
  now = Date.now(),
): Promise<boolean> {
  const expires = now + PROVIDER_LEASE_TTL_MS;
  const result = await redis.eval(
    ACQUIRE_SCRIPT,
    1,
    spec.key,
    jobId,
    String(now),
    String(expires),
    String(spec.limit),
  );
  return Number(result) === 1;
}

/**
 * Polling represents an already-running provider task. Renew it even if a
 * worker outage allowed the original lease to expire; refusing to poll would
 * hide real provider consumption instead of reducing it.
 */
export async function renewProviderLease(
  redis: Redis,
  spec: ProviderConcurrencySpec,
  jobId: string,
  now = Date.now(),
): Promise<void> {
  const expires = now + PROVIDER_LEASE_TTL_MS;
  await redis
    .multi()
    .zremrangebyscore(spec.key, "-inf", now)
    .zadd(spec.key, expires, jobId)
    .pexpire(spec.key, PROVIDER_LEASE_TTL_MS + 60_000)
    .exec();
}

export async function releaseProviderLease(
  redis: Redis,
  spec: ProviderConcurrencySpec,
  jobId: string,
): Promise<void> {
  await redis.zrem(spec.key, jobId);
}
