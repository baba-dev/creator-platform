import { randomUUID } from "node:crypto";

import { db } from "@aiwa/db";
import { requireMembership } from "@aiwa/generation";
import {
  ImageStorageError,
  MAX_REFERENCE_IMAGE_BYTES,
  storeReferenceImage,
  validateAndNormalizeReferenceImage,
} from "@aiwa/generation/storage";
import { assertStorageAllocationFits } from "@aiwa/organizations";
import { NextResponse } from "next/server";
import { z } from "zod";

import { generationError } from "@/lib/generation-api";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

const querySchema = z.object({
  organizationId: z.string().min(1).max(100),
});

async function readBodyBounded(request: Request): Promise<Buffer> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_REFERENCE_IMAGE_BYTES
  ) {
    throw new ImageStorageError(
      "IMAGE_OUTPUT_TOO_LARGE",
      "Reference image exceeds the upload size limit.",
    );
  }

  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      size += value.byteLength;
      if (size > MAX_REFERENCE_IMAGE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new ImageStorageError(
          "IMAGE_OUTPUT_TOO_LARGE",
          "Reference image exceeds the upload size limit.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request)) {
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  }

  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  let assetId: string | null = null;
  let objectKey: string | null = null;
  try {
    const { organizationId } = querySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const contentType = request.headers.get("content-type") ?? "";
    if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
      return NextResponse.json(
        { error: "Only JPEG, PNG, and WebP reference images are accepted." },
        { status: 415 },
      );
    }

    const normalized = await validateAndNormalizeReferenceImage(
      await readBodyBounded(request),
      contentType,
    );
    objectKey = `ref-${randomUUID()}.${normalized.extension}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const asset = await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM Organization WHERE id = ${organizationId} FOR UPDATE`;
        await requireMembership(tx, organizationId, session.user.id, true);

        const assets = await tx.asset.findMany({
          where: { organizationId, status: { not: "DELETED" } },
          select: { storageOwnerUserId: true, byteSize: true },
        });
        assertStorageAllocationFits(
          assets
            .filter((item) => item.storageOwnerUserId === session.user.id)
            .reduce((total, item) => total + item.byteSize, 0n),
          assets.reduce((total, item) => total + item.byteSize, 0n),
          normalized.byteSize,
        );

        return tx.asset.create({
          data: {
            organizationId,
            storageOwnerUserId: session.user.id,
            status: "PENDING",
            objectKey: objectKey!,
            mimeType: normalized.mimeType,
            byteSize: normalized.byteSize,
            sha256: normalized.sha256,
            width: normalized.width,
            height: normalized.height,
            expiresAt,
          },
          select: {
            id: true,
            mimeType: true,
            byteSize: true,
            width: true,
            height: true,
            expiresAt: true,
          },
        });
      },
      { isolationLevel: "ReadCommitted", timeout: 15000 },
    );
    assetId = asset.id;

    await storeReferenceImage(objectKey, normalized.bytes);
    await db.$transaction(async (tx) => {
      await tx.asset.update({
        where: { id: asset.id },
        data: { status: "READY" },
      });
      await tx.auditEvent.create({
        data: {
          actorUserId: session.user.id,
          organizationId,
          action: "asset.reference_uploaded",
          targetType: "Asset",
          targetId: asset.id,
          metadata: {
            mimeType: asset.mimeType,
            byteSize: asset.byteSize.toString(),
            width: asset.width,
            height: asset.height,
          },
        },
      });
    });

    return NextResponse.json(
      {
        asset: {
          ...asset,
          byteSize: asset.byteSize.toString(),
        },
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (assetId) {
      await db.asset
        .updateMany({
          where: { id: assetId, status: "PENDING" },
          data: { status: "DELETED", byteSize: 0n },
        })
        .catch(() => undefined);
    }
    if (error instanceof ImageStorageError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === "IMAGE_OUTPUT_TOO_LARGE" ? 413 : 400 },
      );
    }
    return generationError(error);
  }
}
