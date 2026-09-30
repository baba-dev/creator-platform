import { open, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertUploadSize,
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
import { requireAssetMembership, serializeAsset } from "@/lib/asset-api";
import { rateLimit } from "@/lib/rate-limit";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";
import { safeErrorMessage } from "@/lib/safe-error";

const mediaUploadLimiter = rateLimit({
  max: 20,
  windowMs: 60_000,
  prefix: "media-upload",
});

export const runtime = "nodejs";
const LIMIT = 100_000_000;
export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request))
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );

  const rateLimited = await mediaUploadLimiter.check(session.user.id);
  if (rateLimited) return rateLimited;
  const organizationId = request.headers.get("x-organization-id") ?? "";
  if (!(await requireAssetMembership(session, organizationId, true)))
    return NextResponse.json(
      { error: "Workspace access denied." },
      { status: 403 },
    );
  const name = (request.headers.get("x-file-name") ?? "Media upload").slice(
    0,
    191,
  );
  const declared = Number(request.headers.get("content-length"));
  if (declared > LIMIT)
    return NextResponse.json(
      { error: "File exceeds 100 MB." },
      { status: 413 },
    );
  if (!request.body)
    return NextResponse.json({ error: "File is empty." }, { status: 400 });
  const root = await mkdtemp(join(tmpdir(), "aiwa-upload-"));
  const path = join(root, "media");
  const storage = new LocalAssetStorage(parseServerEnv().ASSET_STORAGE_ROOT);
  let pending: { id: string; byteSize: bigint; objectKey: string } | null =
    null;
  try {
    const reader = request.body.getReader();
    const output = await open(path, "wx", 0o600);
    let bytes = 0;
    try {
      for (;;) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const next = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error("Upload timed out.")),
              120_000,
            );
          }),
        ]).finally(() => clearTimeout(timer));
        if (next.done) break;
        bytes += next.value.byteLength;
        if (bytes > LIMIT) throw new Error("File exceeds 100 MB.");
        await output.writeFile(next.value);
      }
    } finally {
      await output.close();
      await reader.cancel().catch(() => undefined);
    }
    const signatureFile = await open(path, "r");
    const signature = Buffer.alloc(16);
    try {
      await signatureFile.read(signature, 0, 16, 0);
    } finally {
      await signatureFile.close();
    }
    const inspected = inspectAssetUpload(signature, name);
    if (!["VIDEO", "AUDIO"].includes(inspected.mediaKind))
      throw new Error("Choose an MP4, MP3 or WAV file.");
    assertUploadSize(inspected.mediaKind, BigInt(bytes));
    const media = await probeUploadedMedia(
      path,
      inspected.mediaKind as "VIDEO" | "AUDIO",
    );
    const objectKey = createAssetObjectKey(organizationId, inspected.extension);
    pending = await db.$transaction((tx) =>
      createPendingUpload(tx, {
        organizationId,
        userId: session.user.id,
        objectKey,
        mediaKind: inspected.mediaKind,
        mimeType: inspected.mimeType,
        byteSize: BigInt(bytes),
        originalFilename: name,
      }),
    );
    const stored = await storage.putFile(objectKey, path);
    const asset = await db.$transaction((tx) =>
      finalizeUploadedAsset(tx, {
        assetId: pending!.id,
        organizationId,
        actorUserId: session.user.id,
        actualBytes: stored.byteSize,
        sha256: stored.sha256,
        width: media.width,
        height: media.height,
        durationMs: media.durationMs,
      }),
    );
    return NextResponse.json({ asset: serializeAsset(asset) }, { status: 201 });
  } catch (error) {
    if (pending) {
      const cancelled = await db
        .$transaction((tx) =>
          failPendingUpload(tx, {
            assetId: pending!.id,
            organizationId,
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
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
