import {
  assertUploadSize,
  createPendingUpload,
  failPendingUpload,
  finalizeUploadedAsset,
  inspectAssetUpload,
} from "@aiwa/assets";
import { createAssetObjectKey, LocalAssetStorage } from "@aiwa/assets/storage";
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
      }),
    );
    pending = created;

    const stored = await storage.put(objectKey, bytes);
    let width: number | null = null;
    let height: number | null = null;
    if (inspected.mediaKind === "IMAGE") {
      const metadata = await sharp(bytes, { failOn: "error" }).metadata();
      width = metadata.width ?? null;
      height = metadata.height ?? null;
    }

    const asset = await db.$transaction((tx) =>
      finalizeUploadedAsset(tx, {
        assetId: created.id,
        organizationId,
        actorUserId: session.user.id,
        actualBytes: stored.byteSize,
        sha256: stored.sha256,
        width,
        height,
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
      if (cancelled)
        await storage.delete(pending.objectKey).catch(() => undefined);
    }
    return NextResponse.json(
      { error: safeErrorMessage(error, "Upload failed.") },
      { status: 400 },
    );
  }
}
