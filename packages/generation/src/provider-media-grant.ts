import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_TTL_MS = 3 * 60 * 60 * 1000;
const TOKEN = /^v1\.(\d{13})\.([a-f0-9]{64})$/;

function signature(
  secret: string,
  jobId: string,
  assetId: string,
  expires: number,
) {
  return createHmac("sha256", secret)
    .update(`provider-media:v1:${jobId}:${assetId}:${expires}`)
    .digest("hex");
}

/** A capability for one source asset and one generation job, never a general asset URL. */
export function issueProviderMediaGrant(input: {
  secret: string;
  jobId: string;
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
    !input.jobId ||
    !input.assetId
  )
    throw new Error("Invalid provider media grant configuration.");
  const expires = now + ttl;
  return `v1.${expires}.${signature(input.secret, input.jobId, input.assetId, expires)}`;
}

export function verifyProviderMediaGrant(input: {
  secret: string;
  jobId: string;
  assetId: string;
  token: string;
  now?: number;
}): boolean {
  const match = TOKEN.exec(input.token);
  if (!match || input.secret.length < 32 || !input.jobId || !input.assetId)
    return false;
  const now = input.now ?? Date.now();
  const expires = Number(match[1]);
  if (!Number.isSafeInteger(now) || expires < now || expires > now + MAX_TTL_MS)
    return false;
  const expected = Buffer.from(
    signature(input.secret, input.jobId, input.assetId, expires),
    "hex",
  );
  const received = Buffer.from(match[2]!, "hex");
  return timingSafeEqual(received, expected);
}
