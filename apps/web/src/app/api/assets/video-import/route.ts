import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createPendingUpload,
  failPendingUpload,
  finalizeUploadedAsset,
  inspectAssetUpload,
} from "@aiwa/assets";
import { probeUploadedMedia } from "@aiwa/assets/media-probe";
import { createAssetObjectKey, LocalAssetStorage } from "@aiwa/assets/storage";
import { parseServerEnv } from "@aiwa/config";
import { db } from "@aiwa/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAssetMembership, serializeAsset } from "@/lib/asset-api";
import { rateLimit } from "@/lib/rate-limit";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";
import { approvedVideoUrl, downloadApprovedVideo } from "@/lib/video-import";
import { safeErrorMessage } from "@/lib/safe-error";

const videoImportLimiter = rateLimit({
  max: 10,
  windowMs: 60_000,
  prefix: "video-import",
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

  const rateLimited = await videoImportLimiter.check(session.user.id);
  if (rateLimited) return rateLimited;
  const text = await request.text();
  if (text.length > 4096)
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
      { error: "Invalid video import request." },
      { status: 400 },
    );
  const { organizationId } = parsed.data;
  if (!(await requireAssetMembership(session, organizationId, true)))
    return NextResponse.json(
      { error: "Workspace access denied." },
      { status: 403 },
    );
  let url: URL;
  try {
    url = approvedVideoUrl(
      parsed.data.url,
      process.env.VIDEO_IMPORT_ALLOWED_HOSTS ?? "",
    );
  } catch (error) {
    return NextResponse.json(
      { error: safeErrorMessage(error, "URL unavailable.") },
      { status: 400 },
    );
  }
  const root = await mkdtemp(join(tmpdir(), "aiwa-video-link-"));
  const path = join(root, "video.mp4");
  const storage = new LocalAssetStorage(parseServerEnv().ASSET_STORAGE_ROOT);
  let pending: { id: string; byteSize: bigint; objectKey: string } | null =
    null;
  try {
    const bytes = await downloadApprovedVideo(url, path);
    const file = await open(path, "r");
    const signature = Buffer.alloc(16);
    try {
      await file.read(signature, 0, 16, 0);
    } finally {
      await file.close();
    }
    if (inspectAssetUpload(signature, "video.mp4").mediaKind !== "VIDEO")
      throw new Error("Linked file is not a supported MP4.");
    const media = await probeUploadedMedia(path, "VIDEO");
    const objectKey = createAssetObjectKey(organizationId, "mp4");
    pending = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM Organization WHERE id = ${organizationId} FOR UPDATE`;
      const asset = await createPendingUpload(tx, {
        organizationId,
        userId: session.user.id,
        objectKey,
        mediaKind: "VIDEO",
        mimeType: "video/mp4",
        byteSize: BigInt(bytes),
        originalFilename: "Imported video.mp4",
      });
      return tx.asset.update({
        where: { id: asset.id },
        data: {
          purpose: "REFERENCE_INPUT",
          sourceType: "IMPORTED",
          name: `Imported video · ${url.hostname}`,
        },
      });
    });
    const stored = await storage.putFile(objectKey, path);
    const asset = await db.$transaction(async (tx) => {
      const ready = await finalizeUploadedAsset(tx, {
        assetId: pending!.id,
        organizationId,
        reservedBytes: pending!.byteSize,
        actualBytes: stored.byteSize,
        sha256: stored.sha256,
        width: media.width,
        height: media.height,
        durationMs: media.durationMs,
      });
      await tx.auditEvent.create({
        data: {
          actorUserId: session.user.id,
          organizationId,
          action: "asset.video_imported",
          targetType: "Asset",
          targetId: ready.id,
          metadata: { sourceHost: url.hostname },
        },
      });
      return ready;
    });
    return NextResponse.json({ asset: serializeAsset(asset) }, { status: 201 });
  } catch (error) {
    if (pending) {
      await storage.delete(pending.objectKey).catch(() => undefined);
      await db
        .$transaction((tx) =>
          failPendingUpload(tx, {
            assetId: pending!.id,
            organizationId,
            reservedBytes: pending!.byteSize,
          }),
        )
        .catch(() => undefined);
    }
    const message = safeErrorMessage(error, "Video import failed.");
    return NextResponse.json(
      {
        error: /Video link|Linked file|MP4|duration|codec|dimensions/.test(
          message,
        )
          ? message
          : "Video import failed.",
      },
      { status: 400 },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
