import {
  AssetQuotaExceededError,
  finalizeAssetStorage,
  normalizeAssetName,
  normalizeOriginalFilename,
  releaseAssetStorage,
  reserveAssetStorage,
} from "@aiwa/assets";
import {
  createAssetObjectKey,
  LocalAssetStorage,
} from "@aiwa/assets/storage";
import { db } from "@aiwa/db";
import { requireMembership } from "@aiwa/generation";
import {
  ImageStorageError,
  MAX_REFERENCE_IMAGE_BYTES,
  validateReferenceImage,
} from "@aiwa/generation/storage";
import { NextResponse } from "next/server";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

const MAX_MULTIPART_BYTES = MAX_REFERENCE_IMAGE_BYTES + 1024 * 1024;

function assetStorage(): LocalAssetStorage {
  const root = process.env.ASSET_STORAGE_ROOT;
  if (!root) throw new Error("Asset storage root is not configured.");
  return new LocalAssetStorage(root);
}

function quotaResponse(error: AssetQuotaExceededError): NextResponse {
  return NextResponse.json(
    {
      error: error.message,
      code: "STORAGE_QUOTA_EXCEEDED",
      scope: error.scope,
      quotaBytes: error.quotaBytes.toString(),
      usedBytes: error.usedBytes.toString(),
      proposedBytes: error.proposedBytes.toString(),
    },
    { status: 409 },
  );
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

  const rawLength = request.headers.get("content-length");
  const declaredLength = rawLength === null ? null : Number(rawLength);
  if (
    declaredLength !== null &&
    (!Number.isSafeInteger(declaredLength) ||
      declaredLength <= 0 ||
      declaredLength > MAX_MULTIPART_BYTES)
  ) {
    return NextResponse.json(
      { error: "Reference image exceeds the upload limit." },
      { status: 413 },
    );
  }

  let assetId: string | null = null;
  let objectKey: string | null = null;
  let objectStored = false;
  try {
    const form = await request.formData();
    const organizationId = String(form.get("organizationId") ?? "").trim();
    const file = form.get("file");
    if (!organizationId || !(file instanceof File)) {
      return NextResponse.json(
        { error: "organizationId and one image file are required." },
        { status: 400 },
      );
    }
    if (file.size <= 0 || file.size > MAX_REFERENCE_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "Reference image must be no larger than 30 MB." },
        { status: 413 },
      );
    }

    await requireMembership(db, organizationId, session.user.id, true);
    const validated = await validateReferenceImage(
      Buffer.from(await file.arrayBuffer()),
    );
    objectKey = createAssetObjectKey(organizationId, validated.extension);

    const pending = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM Organization WHERE id = ${organizationId} FOR UPDATE`;
      await requireMembership(tx, organizationId, session.user.id, true);
      await reserveAssetStorage(tx, {
        organizationId,
        userId: session.user.id,
        proposedBytes: validated.byteSize,
      });
      return tx.asset.create({
        data: {
          organizationId,
          storageOwnerUserId: session.user.id,
          createdById: session.user.id,
          uploadedById: session.user.id,
          status: "PENDING",
          purpose: "REFERENCE_INPUT",
          mediaKind: "IMAGE",
          sourceType: "UPLOADED",
          storageProvider: "LOCAL",
          name: normalizeAssetName(file.name, "Reference image"),
          originalFilename: normalizeOriginalFilename(file.name),
          objectKey,
          mimeType: validated.mimeType,
          byteSize: validated.byteSize,
          width: validated.width,
          height: validated.height,
          sha256: validated.sha256,
        },
        select: {
          id: true,
          objectKey: true,
          byteSize: true,
        },
      });
    });
    assetId = pending.id;

    const stored = await assetStorage().put(pending.objectKey, validated.bytes);
    objectStored = true;

    const asset = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM Asset WHERE id = ${pending.id} FOR UPDATE`;
      const current = await tx.asset.findUniqueOrThrow({
        where: { id: pending.id },
        select: { status: true, byteSize: true },
      });
      if (current.status !== "PENDING") {
        throw new Error("Reference upload state changed before finalization.");
      }
      await finalizeAssetStorage(tx, {
        organizationId,
        reservedBytes: current.byteSize,
        actualBytes: stored.byteSize,
      });
      const ready = await tx.asset.update({
        where: { id: pending.id },
        data: {
          status: "READY",
          byteSize: stored.byteSize,
          sha256: stored.sha256,
        },
        select: {
          id: true,
          mimeType: true,
          byteSize: true,
          width: true,
          height: true,
          createdAt: true,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorUserId: session.user.id,
          organizationId,
          action: "asset.reference_uploaded",
          targetType: "Asset",
          targetId: ready.id,
          metadata: {
            mimeType: ready.mimeType,
            byteSize: ready.byteSize.toString(),
            width: ready.width,
            height: ready.height,
          },
        },
      });
      return ready;
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
      await db
        .$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM Asset WHERE id = ${assetId} FOR UPDATE`;
          const current = await tx.asset.findUnique({
            where: { id: assetId },
            select: {
              status: true,
              byteSize: true,
              organizationId: true,
            },
          });
          if (!current || current.status !== "PENDING") return;
          await releaseAssetStorage(tx, {
            organizationId: current.organizationId,
            reservedBytes: current.byteSize,
          });
          await tx.asset.update({
            where: { id: assetId },
            data: {
              status: "DELETED",
              byteSize: 0n,
              deletedAt: new Date(),
              purgeAfter: new Date(),
            },
          });
        })
        .catch(() => undefined);
    }
    if (objectStored && objectKey) {
      await assetStorage().delete(objectKey).catch(() => undefined);
    }
    if (error instanceof AssetQuotaExceededError) return quotaResponse(error);
    if (error instanceof ImageStorageError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === "IMAGE_OUTPUT_TOO_LARGE" ? 413 : 400 },
      );
    }
    if (
      error instanceof Error &&
      error.message === "Workspace access denied."
    ) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: "Reference upload failed. Retry the upload." },
      { status: 503 },
    );
  }
}

export async function GET(request: Request) {
  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  const organizationId =
    new URL(request.url).searchParams.get("organizationId") ?? "";
  try {
    await requireMembership(db, organizationId, session.user.id, true);
    const assets = await db.asset.findMany({
      where: {
        organizationId,
        storageOwnerUserId: session.user.id,
        purpose: "REFERENCE_INPUT",
        mediaKind: "IMAGE",
        status: "READY",
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        name: true,
        mimeType: true,
        byteSize: true,
        width: true,
        height: true,
        createdAt: true,
      },
    });
    return NextResponse.json(
      {
        assets: assets.map((asset) => ({
          ...asset,
          byteSize: asset.byteSize.toString(),
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Workspace access denied." },
      { status: 403 },
    );
  }
}
