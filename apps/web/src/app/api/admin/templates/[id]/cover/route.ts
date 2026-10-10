import { randomUUID } from "node:crypto";
import { LocalAssetStorage } from "@aiwa/assets/storage";
import { hasPlatformPermission } from "@aiwa/authz";
import { parseServerEnv } from "@aiwa/config";
import { db } from "@aiwa/db";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";
import { rateLimit } from "@/lib/rate-limit";

const limiter = rateLimit({
  max: 8,
  windowMs: 60_000,
  prefix: "template-cover-upload",
  failureMode: "closed",
});
const maxRequestBytes = 8_500_000;
function storage() {
  return new LocalAssetStorage(parseServerEnv().ASSET_STORAGE_ROOT);
}
async function authorize(request: Request) {
  if (!hasTrustedMutationOrigin(request))
    return {
      error: NextResponse.json(
        { error: "Origin not allowed." },
        { status: 403 },
      ),
    };
  const session = await getRequestSession(request.headers);
  if (
    !session ||
    !hasPlatformPermission(session.user.platformRole, "templates:manage")
  )
    return {
      error: NextResponse.json(
        { error: "Template administration denied." },
        { status: 403 },
      ),
    };
  return { session };
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await authorize(request);
  if ("error" in access) return access.error;
  const limit = await limiter.check(access.session.user.id);
  if (limit) return limit;
  const { id } = await params;
  const existing = await db.generationTemplate.findUnique({
    where: { id },
    select: { id: true, coverObjectKey: true },
  });
  if (!existing)
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  let objectKey: string | undefined;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Choose a cover image.");
    let received = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      received += chunk.value.length;
      if (received > maxRequestBytes) {
        await reader.cancel();
        throw new Error("Cover uploads must be under 8 MB.");
      }
      chunks.push(chunk.value);
    }
    const form = await new Response(Buffer.concat(chunks), {
      headers: { "Content-Type": request.headers.get("content-type") ?? "" },
    }).formData();
    const file = form.get("file");
    const alt = String(form.get("alt") ?? "").trim();
    if (
      !(file instanceof File) ||
      !["image/png", "image/jpeg", "image/webp"].includes(file.type)
    )
      throw new Error("Select a JPG, PNG or WebP image.");
    if (!alt || alt.length > 240)
      throw new Error(
        "Provide meaningful cover image alt text (up to 240 characters).",
      );
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length > 8_000_000 || bytes.length === 0)
      throw new Error("Cover uploads must be under 8 MB.");
    const picture = sharp(bytes, { limitInputPixels: 32_000_000 });
    const metadata = await picture.metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      !["jpeg", "png", "webp"].includes(metadata.format ?? "")
    )
      throw new Error("Unsupported image data.");
    const output = await picture
      .rotate()
      .resize(960, 540, { fit: "cover", position: "attention" })
      .webp({ quality: 82, effort: 4 })
      .toBuffer();
    if (output.length > 2_000_000)
      throw new Error("The optimized image is too large.");
    objectKey = `templates/covers/${randomUUID()}.webp`;
    const store = storage();
    await store.put(objectKey, output);
    const changed = await db.$transaction(async (tx) => {
      const claimed = await tx.generationTemplate.updateMany({
        where: { id, coverObjectKey: existing.coverObjectKey },
        data: { coverObjectKey: objectKey!, coverAlt: alt },
      });
      if (claimed.count !== 1)
        throw new Error(
          "This template was updated elsewhere. Refresh and retry.",
        );
      await tx.auditEvent.create({
        data: {
          actorUserId: access.session.user.id,
          action: "template.cover.updated",
          targetType: "GenerationTemplate",
          targetId: id,
          metadata: {
            imageBytes: output.length,
            previousCover: existing.coverObjectKey !== null,
          },
        },
      });
      return true;
    });
    if (changed && existing.coverObjectKey)
      await store.delete(existing.coverObjectKey).catch(() => undefined);
    return NextResponse.json(
      { ok: true, optimizedBytes: output.length },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (reason) {
    if (objectKey)
      await storage()
        .delete(objectKey)
        .catch(() => undefined);
    return NextResponse.json(
      {
        error:
          reason instanceof Error ? reason.message : "Cover upload failed.",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await authorize(request);
  if ("error" in access) return access.error;
  const { id } = await params;
  const existing = await db.generationTemplate.findUnique({
    where: { id },
    select: { coverObjectKey: true },
  });
  if (!existing)
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  if (!existing.coverObjectKey) return NextResponse.json({ ok: true });
  const deleted = await db.$transaction(async (tx) => {
    const updated = await tx.generationTemplate.updateMany({
      where: { id, coverObjectKey: existing.coverObjectKey },
      data: { coverObjectKey: null, coverAlt: null },
    });
    if (updated.count !== 1) return false;
    await tx.auditEvent.create({
      data: {
        actorUserId: access.session.user.id,
        action: "template.cover.removed",
        targetType: "GenerationTemplate",
        targetId: id,
        metadata: {},
      },
    });
    return true;
  });
  if (!deleted)
    return NextResponse.json(
      { error: "Template was updated elsewhere; refresh and retry." },
      { status: 409 },
    );
  await storage()
    .delete(existing.coverObjectKey)
    .catch(() => undefined);
  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
