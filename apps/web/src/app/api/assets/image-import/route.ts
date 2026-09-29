import {
  finalizeAssetStorage,
  releaseAssetStorage,
  reserveAssetStorage,
} from "@aiwa/assets";
import { createAssetObjectKey, LocalAssetStorage } from "@aiwa/assets/storage";
import { db } from "@aiwa/db";
import {
  ImageStorageError,
  validateReferenceImage,
} from "@aiwa/generation/storage";
import { NextResponse } from "next/server";
import { z } from "zod";
import { approvedImageUrl, fetchApprovedImage } from "@/lib/image-import";
import { rateLimit } from "@/lib/rate-limit";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";
import { safeErrorMessage } from "@/lib/safe-error";
import { requireMembership } from "@aiwa/generation";

const imageImportLimiter = rateLimit({
  max: 10,
  windowMs: 60_000,
  prefix: "image-import",
});

export const runtime = "nodejs";
const schema = z
  .object({
    organizationId: z.string().min(1).max(100),
    url: z.url().max(2048),
  })
  .strict();

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request))
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );

  const rateLimited = await imageImportLimiter.check(session.user.id);
  if (rateLimited) return rateLimited;
  const text = await request.text();
  if (text.length > 4_096)
    return NextResponse.json({ error: "Request too large." }, { status: 413 });
  const parsed = schema.safeParse(
    (() => {
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    })(),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid image import request." },
      { status: 400 },
    );
  const { organizationId } = parsed.data;
  try {
    await requireMembership(db, organizationId, session.user.id, true);
  } catch {
    return NextResponse.json(
      { error: "Workspace access denied." },
      { status: 403 },
    );
  }
  let url: URL;
  try {
    url = approvedImageUrl(
      parsed.data.url,
      process.env.IMAGE_IMPORT_ALLOWED_HOSTS ?? "",
    );
  } catch (error) {
    return NextResponse.json(
      { error: safeErrorMessage(error, "Invalid URL.") },
      { status: 400 },
    );
  }

  let pending: { id: string; objectKey: string; byteSize: bigint } | null =
    null;
  let stored = false;
  const root = process.env.ASSET_STORAGE_ROOT;
  if (!root)
    return NextResponse.json(
      { error: "Asset storage is unavailable." },
      { status: 503 },
    );
  const storage = new LocalAssetStorage(root);
  try {
    const fetched = await fetchApprovedImage(url);
    const image = await validateReferenceImage(fetched);
    const objectKey = createAssetObjectKey(organizationId, image.extension);
    pending = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM Organization WHERE id = ${organizationId} FOR UPDATE`;
      await requireMembership(tx, organizationId, session.user.id, true);
      await reserveAssetStorage(tx, {
        organizationId,
        userId: session.user.id,
        proposedBytes: image.byteSize,
      });
      return tx.asset.create({
        data: {
          organizationId,
          storageOwnerUserId: session.user.id,
          createdById: session.user.id,
          status: "PENDING",
          purpose: "REFERENCE_INPUT",
          mediaKind: "IMAGE",
          sourceType: "IMPORTED",
          storageProvider: "LOCAL",
          name: `Imported image · ${url.hostname}`,
          objectKey,
          mimeType: image.mimeType,
          byteSize: image.byteSize,
          width: image.width,
          height: image.height,
        },
        select: { id: true, objectKey: true, byteSize: true },
      });
    });
    const output = await storage.put(objectKey, image.bytes);
    stored = true;
    const asset = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM Asset WHERE id = ${pending!.id} FOR UPDATE`;
      const current = await tx.asset.findUniqueOrThrow({
        where: { id: pending!.id },
      });
      if (current.status !== "PENDING")
        throw new Error("Import state changed.");
      await finalizeAssetStorage(tx, {
        organizationId,
        reservedBytes: current.byteSize,
        actualBytes: output.byteSize,
      });
      const ready = await tx.asset.update({
        where: { id: current.id },
        data: {
          status: "READY",
          byteSize: output.byteSize,
          sha256: output.sha256,
        },
        select: { id: true, name: true, width: true, height: true },
      });
      await tx.auditEvent.create({
        data: {
          actorUserId: session.user.id,
          organizationId,
          action: "asset.image_imported",
          targetType: "Asset",
          targetId: ready.id,
          metadata: { sourceHost: url.hostname },
        },
      });
      return ready;
    });
    return NextResponse.json(
      { asset },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (pending) {
      const id = pending.id;
      await db
        .$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM Asset WHERE id = ${id} FOR UPDATE`;
          const current = await tx.asset.findUnique({ where: { id } });
          if (!current || current.status !== "PENDING") return;
          await releaseAssetStorage(tx, {
            organizationId,
            reservedBytes: current.byteSize,
          });
          await tx.asset.update({
            where: { id },
            data: {
              status: "DELETED",
              byteSize: 0n,
              deletedAt: new Date(),
              purgeAfter: new Date(),
            },
          });
        })
        .catch(() => undefined);
      if (stored)
        await storage.delete(pending.objectKey).catch(() => undefined);
    }
    if (error instanceof Error && /quota exceeded/i.test(error.message))
      return NextResponse.json({ error: error.message }, { status: 409 });
    if (
      error instanceof ImageStorageError ||
      (error instanceof Error &&
        /Image link|Linked image|unsupported|Invalid image/i.test(
          error.message,
        ))
    )
      return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(
      { error: "Image import failed. Try another approved link." },
      { status: 503 },
    );
  }
}
