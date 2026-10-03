import {
  assertUploadSize,
  createPendingUpload,
  failPendingUpload,
  finalizeUploadedAsset,
  inspectAssetUpload,
} from "@aiwa/assets";
import {
  createAssetObjectKey,
  createAssetVariantObjectKey,
  LocalAssetStorage,
  resolveOrganizationStorage,
} from "@aiwa/assets/storage";
import { inspectAndProbeUploadedMedia } from "@aiwa/assets/media-probe";
import { parseServerEnv } from "@aiwa/config";
import { db } from "@aiwa/db";
import { NextResponse } from "next/server";
import sharp from "sharp";

import { requireAssetMembership, serializeAsset } from "@/lib/asset-api";
import { rateLimit } from "@/lib/rate-limit";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

const uploadLimiter = rateLimit({
  max: 20,
  windowMs: 60_000,
  prefix: "upload",
});
import { safeErrorMessage } from "@/lib/safe-error";

export const runtime = "nodejs";
const env = parseServerEnv();

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request))
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );

  const rateLimited = await uploadLimiter.check(session.user.id);
  if (rateLimited) return rateLimited;
  let pending:
    | {
        id: string;
        organizationId: string;
        byteSize: bigint;
        objectKey: string;
      }
    | undefined;
  let pendingStorage:
    | Awaited<ReturnType<typeof resolveOrganizationStorage>>
    | undefined;
  let pendingExternalFileId: string | undefined;
  let pendingThumbnailKey: string | undefined;
  const storage = new LocalAssetStorage(env.ASSET_STORAGE_ROOT);

  try {
    const form = await request.formData();
    const organizationId = String(form.get("organizationId") ?? "");
    const membership = await requireAssetMembership(
      session,
      organizationId,
      true,
    );
    if (!membership)
      return NextResponse.json(
        { error: "Workspace access denied." },
        { status: 403 },
      );

    const file = form.get("file");
    if (!(file instanceof File))
      return NextResponse.json(
        { error: "Choose a file to upload." },
        { status: 400 },
      );
    if (file.size > 104_857_600)
      return NextResponse.json(
        { error: "Upload exceeds the 100 MB hard limit." },
        { status: 413 },
      );

    const projectId = String(form.get("projectId") ?? "") || null;
    const folderId = String(form.get("folderId") ?? "") || null;
    if (projectId) {
      const project = await db.project.findFirst({
        where: { id: projectId, organizationId, archivedAt: null },
        select: { id: true },
      });
      if (!project)
        return NextResponse.json(
          { error: "Project is unavailable." },
          { status: 400 },
        );
    }
    if (folderId) {
      const folder = await db.assetFolder.findFirst({
        where: { id: folderId, organizationId },
        select: { id: true },
      });
      if (!folder)
        return NextResponse.json(
          { error: "Folder is unavailable." },
          { status: 400 },
        );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const inspected = inspectAssetUpload(bytes, file.name);
    assertUploadSize(inspected.mediaKind, BigInt(bytes.byteLength));
    const objectKey = createAssetObjectKey(organizationId, inspected.extension);

    const targetStorage = await resolveOrganizationStorage(db, organizationId, {
      storageRoot: env.ASSET_STORAGE_ROOT,
      encryptionKey: env.STORAGE_ENCRYPTION_KEY,
      googleClientId: env.GOOGLE_DRIVE_CLIENT_ID,
      googleClientSecret: env.GOOGLE_DRIVE_CLIENT_SECRET,
      onedriveClientId: env.ONEDRIVE_CLIENT_ID,
      onedriveClientSecret: env.ONEDRIVE_CLIENT_SECRET,
    });
    pendingStorage = targetStorage;

    const created = await db.$transaction((tx) =>
      createPendingUpload(tx, {
        organizationId,
        userId: session.user.id,
        projectId,
        folderId,
        objectKey,
        mediaKind: inspected.mediaKind,
        mimeType: inspected.mimeType,
        byteSize: BigInt(bytes.byteLength),
        originalFilename: file.name,
        storageProvider: targetStorage.provider,
      }),
    );
    pending = created;

    const media = await inspectAndProbeUploadedMedia({
      bytes,
      kind: inspected.mediaKind,
      extension: inspected.extension,
      imageInspector: async (source) => {
        const metadata = await sharp(source, { failOn: "error" }).metadata();
        return {
          width: metadata.width ?? null,
          height: metadata.height ?? null,
        };
      },
    });

    const stored = await targetStorage.put(objectKey, bytes, inspected.mimeType);
    pendingExternalFileId = stored.externalFileId;

    // If BYOS is active and asset is an image, store thumbnail locally on platform storage for instant grid preview
    if (targetStorage.provider !== "LOCAL" && inspected.mediaKind === "IMAGE") {
      try {
        const thumbBytes = await sharp(bytes)
          .rotate()
          .resize(560, 560, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer({ resolveWithObject: true });

        const thumbKey = createAssetVariantObjectKey(organizationId, "webp");
        pendingThumbnailKey = thumbKey;
        const storedThumb = await storage.put(thumbKey, thumbBytes.data);

        await db.assetVariant.create({
          data: {
            assetId: created.id,
            kind: "THUMBNAIL",
            storageProvider: "LOCAL",
            objectKey: thumbKey,
            mimeType: "image/webp",
            byteSize: storedThumb.byteSize,
            sha256: storedThumb.sha256,
            width: thumbBytes.info.width,
            height: thumbBytes.info.height,
          },
        });
      } catch {
        // Derivative generation non-fatal
      }
    }

    const asset = await db.$transaction((tx) =>
      finalizeUploadedAsset(tx, {
        assetId: created.id,
        organizationId,
        actorUserId: session.user.id,
        actualBytes: stored.byteSize,
        sha256: stored.sha256,
        width: media.width,
        height: media.height,
        durationMs: media.durationMs,
        externalFileId: stored.externalFileId ?? null,
        storageProvider: targetStorage.provider,
      }),
    );

    return NextResponse.json({ asset: serializeAsset(asset) }, { status: 201 });
  } catch (error) {
    if (pending) {
      const cancelled = await db
        .$transaction((tx) =>
          failPendingUpload(tx, {
            assetId: pending!.id,
            organizationId: pending!.organizationId,
          }),
        )
        .catch(() => false);
      if (cancelled) {
        if (pendingStorage) {
          await pendingStorage
            .delete(pending.objectKey, pendingExternalFileId)
            .catch(() => undefined);
        }
        if (pendingThumbnailKey) {
          await storage.delete(pendingThumbnailKey).catch(() => undefined);
        }
      }
    }
    return NextResponse.json(
      { error: safeErrorMessage(error, "Upload failed.") },
      { status: 400 },
    );
  }
}
