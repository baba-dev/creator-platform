import { readLearnBody } from "@/lib/learn/body";
import { rateLimit } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { z } from "zod";
import { LearnError, savePost } from "@aiwa/learn";
import { learnAdmin } from "@/lib/learn/auth";
const limiter = rateLimit({
  max: 30,
  windowMs: 60000,
  prefix: "learn-publish",
});
const schema = z.object({
  id: z.string().max(100).optional(),
  version: z.number().int().positive().optional(),
  content: z.unknown(),
  action: z.enum(["save", "review", "publish", "schedule", "unpublish"]),
  scheduledAt: z.string().max(40).optional(),
  reviewAt: z.string().max(40).optional(),
});
export async function POST(request: Request) {
  const session = await learnAdmin(request);
  if (!session)
    return NextResponse.json(
      { error: "Publishing access denied." },
      { status: 403 },
    );
  const limited = await limiter.check(session.user.id);
  if (limited) return limited;
  const text = await readLearnBody(request).catch(() => null);
  if (text === null)
    return NextResponse.json({ error: "Article too large." }, { status: 413 });
  const parsed = schema.safeParse(
    await Promise.resolve()
      .then(() => JSON.parse(text))
      .catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid publishing request." },
      { status: 400 },
    );
  try {
    const post = await savePost(session.user.id, parsed.data);
    return NextResponse.json({
      id: post.id,
      version: post.version,
      status: post.status,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof LearnError
            ? error.message
            : "Could not save. Check fields and ensure the slug and translation language are unique.",
      },
      { status: error instanceof LearnError ? error.status : 400 },
    );
  }
}
