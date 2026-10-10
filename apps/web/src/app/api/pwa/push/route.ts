import { db } from "@aiwa/db";
import {
  endpointFingerprint,
  validatePushEndpoint,
  vapidPublicKey,
} from "@aiwa/core/web-push";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";
import { rateLimit } from "@/lib/rate-limit";
import { z } from "zod";

export const runtime = "nodejs";

const mutationLimiter = rateLimit({ max: 12, windowMs: 60_000, prefix: "pwa-push" });

const endpoint = z
  .string()
  .url()
  .max(2048)
  .refine((value) => {
    try {
      validatePushEndpoint(value);
      return true;
    } catch {
      return false;
    }
  });
const payload = z
  .object({
    endpoint,
    keys: z.object({
      p256dh: z.string().regex(/^[A-Za-z0-9_-]{80,120}$/),
      auth: z.string().regex(/^[A-Za-z0-9_-]{20,32}$/),
    }),
  })
  .strict();
const gone = () =>
  Response.json({ error: "Authentication required." }, { status: 401 });
const privateKey = () => process.env.PWA_VAPID_PRIVATE_KEY?.trim() || "";

export async function GET(request: Request) {
  const session = await getRequestSession(request.headers);
  if (!session) return gone();
  const key = privateKey();
  const available = Boolean(key);
  let publicKey = "";
  if (available) {
    try {
      publicKey = vapidPublicKey(key);
    } catch {
      return Response.json({ available: false, subscribed: false });
    }
  }
  const subscribed =
    (await db.webPushSubscription.count({
      where: { userId: session.user.id },
    })) > 0;
  return Response.json(
    { available, subscribed, publicKey },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request))
    return Response.json({ error: "Origin not allowed." }, { status: 403 });
  const session = await getRequestSession(request.headers);
  if (!session) return gone();
  const limit = await mutationLimiter.check(session.user.id);
  if (limit) return limit;
  if (!privateKey())
    return Response.json({ error: "Push is not configured." }, { status: 503 });
  const data = payload.safeParse(await request.json().catch(() => null));
  if (!data.success)
    return Response.json({ error: "Invalid subscription." }, { status: 400 });
  const fingerprint = endpointFingerprint(data.data.endpoint);
  const current = await db.webPushSubscription.findUnique({
    where: { endpointHash: fingerprint },
    select: { userId: true },
  });
  if (current && current.userId !== session.user.id)
    return Response.json(
      { error: "Device is already associated with another account." },
      { status: 409 },
    );
  if (
    !current &&
    (await db.webPushSubscription.count({
      where: { userId: session.user.id },
    })) >= 10
  ) {
    return Response.json(
      { error: "Device subscription limit reached." },
      { status: 409 },
    );
  }
  await db.webPushSubscription.upsert({
    where: { endpointHash: fingerprint },
    create: {
      userId: session.user.id,
      endpointHash: fingerprint,
      endpoint: data.data.endpoint,
      ...data.data.keys,
    },
    update: { ...data.data.keys },
  });
  return Response.json(
    { subscribed: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE(request: Request) {
  if (!hasTrustedMutationOrigin(request))
    return Response.json({ error: "Origin not allowed." }, { status: 403 });
  const session = await getRequestSession(request.headers);
  if (!session) return gone();
  const data = z
    .object({ endpoint })
    .strict()
    .safeParse(await request.json().catch(() => null));
  if (!data.success)
    return Response.json({ error: "Invalid subscription." }, { status: 400 });
  await db.webPushSubscription.deleteMany({
    where: {
      endpointHash: endpointFingerprint(data.data.endpoint),
      userId: session.user.id,
    },
  });
  return Response.json(
    { subscribed: false },
    { headers: { "Cache-Control": "no-store" } },
  );
}
