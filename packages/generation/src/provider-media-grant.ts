import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_TTL_MS = 3 * 60 * 60 * 1000;
const TOKEN = /^v1\.(\d{13})\.([a-f0-9]{64})$/;

function signature(
  namespace: "provider-media" | "provider-tool-media",
  secret: string,
  subjectId: string,
  assetId: string,
  expires: number,
) {
  return createHmac("sha256", secret)
    .update(`${namespace}:v1:${subjectId}:${assetId}:${expires}`)
    .digest("hex");
}

function issueGrant(input: {
  namespace: "provider-media" | "provider-tool-media";
  secret: string;
  subjectId: string;
  assetId: string;
  now?: number;
  ttlMs?: number;
}): string {
  const now = input.now ?? Date.now();
  const ttl = input.ttlMs ?? MAX_TTL_MS;
  if (
    input.secret.length < 32 ||
    !Number.isSafeInteger(now) ||
    !Number.isSafeInteger(ttl) ||
    ttl < 1000 ||
    ttl > MAX_TTL_MS ||
    !input.subjectId ||
    !input.assetId
  )
    throw new Error("Invalid provider media grant configuration.");
  const expires = now + ttl;
  return `v1.${expires}.${signature(
    input.namespace,
    input.secret,
    input.subjectId,
    input.assetId,
    expires,
  )}`;
}

function verifyGrant(input: {
  namespace: "provider-media" | "provider-tool-media";
  secret: string;
  subjectId: string;
  assetId: string;
  token: string;
  now?: number;
}): boolean {
  const match = TOKEN.exec(input.token);
  if (!match || input.secret.length < 32 || !input.subjectId || !input.assetId)
    return false;
  const now = input.now ?? Date.now();
  const expires = Number(match[1]);
  if (!Number.isSafeInteger(now) || expires < now || expires > now + MAX_TTL_MS)
    return false;
  const expected = Buffer.from(
    signature(
      input.namespace,
      input.secret,
      input.subjectId,
      input.assetId,
      expires,
    ),
    "hex",
  );
  const received = Buffer.from(match[2]!, "hex");
  return timingSafeEqual(received, expected);
}

/** A capability for one source asset and one generation job, never a general asset URL. */
export function issueProviderMediaGrant(input: {
  secret: string;
  jobId: string;
  assetId: string;
  now?: number;
  ttlMs?: number;
}): string {
  return issueGrant({
    namespace: "provider-media",
    secret: input.secret,
    subjectId: input.jobId,
    assetId: input.assetId,
    now: input.now,
    ttlMs: input.ttlMs,
  });
}

export function verifyProviderMediaGrant(input: {
  secret: string;
  jobId: string;
  assetId: string;
  token: string;
  now?: number;
}): boolean {
  return verifyGrant({
    namespace: "provider-media",
    secret: input.secret,
    subjectId: input.jobId,
    assetId: input.assetId,
    token: input.token,
    now: input.now,
  });
}

/** A capability for one MediaKit execution and one snapshotted source asset. */
export function issueProviderToolMediaGrant(input: {
  secret: string;
  executionId: string;
  assetId: string;
  now?: number;
  ttlMs?: number;
}): string {
  return issueGrant({
    namespace: "provider-tool-media",
    secret: input.secret,
    subjectId: input.executionId,
    assetId: input.assetId,
    now: input.now,
    ttlMs: input.ttlMs,
  });
}

export function verifyProviderToolMediaGrant(input: {
  secret: string;
  executionId: string;
  assetId: string;
  token: string;
  now?: number;
}): boolean {
  return verifyGrant({
    namespace: "provider-tool-media",
    secret: input.secret,
    subjectId: input.executionId,
    assetId: input.assetId,
    token: input.token,
    now: input.now,
  });
}
