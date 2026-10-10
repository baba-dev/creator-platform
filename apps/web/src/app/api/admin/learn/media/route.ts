import { randomUUID } from "node:crypto";
import {
  createPendingUpload,
  failPendingUpload,
  finalizeUploadedAsset,
  inspectAssetUpload,
} from "@aiwa/assets";
import { LocalAssetStorage, createAssetObjectKey } from "@aiwa/assets/storage";
import { parseServerEnv } from "@aiwa/config";
import { db } from "@aiwa/db";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { learnAdmin } from "@/lib/learn/auth";
import { rateLimit } from "@/lib/rate-limit";
const limiter = rateLimit({ max: 15, windowMs: 60000, prefix: "learn-upload" });
let uploading = false;
export async function GET(request: Request) {
  if (!(await learnAdmin(request)))
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  const media = await db.learnMedia.findMany({
    take: 100,
    orderBy: { createdAt: "desc" },
    include: {
      asset: {
        select: { mediaKind: true, width: true, height: true, name: true },
      },
    },
  });
  return NextResponse.json(
    { media },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
export async function POST(request: Request) {
  const session = await learnAdmin(request);
  if (!session)
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  const limited = await limiter.check(session.user.id);
  if (limited) return limited;
  if (uploading)
    return NextResponse.json(
      { error: "Another upload is processing. Try again shortly." },
      { status: 429 },
    );
  uploading = true;
  const storage = new LocalAssetStorage(parseServerEnv().ASSET_STORAGE_ROOT);
  let pending:
    { id: string; organizationId: string; objectKey: string } | undefined;
  try {
    // Read a bounded body even when content-length is absent or inaccurate.
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Missing upload.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > 26_000_000) {
        await reader.cancel();
        throw new Error("Upload limit is 25 MB.");
      }
      chunks.push(next.value);
    }
    const form = await new Response(Buffer.concat(chunks), {
      headers: { "Content-Type": request.headers.get("content-type") ?? "" },
    }).formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("Choose a file.");
    const membership = await db.membership.findFirst({
      where: { userId: session.user.id, organization: { status: "ACTIVE" } },
      orderBy: { createdAt: "asc" },
    });
    if (!membership)
      throw new Error("Create a workspace before uploading editorial media.");
    let bytes = Buffer.from(await file.arrayBuffer());
    let inspected = inspectAssetUpload(bytes, file.name);
    let width: number | null = null;
    let height: number | null = null;
    if (inspected.mediaKind === "IMAGE") {
      const result = await sharp(bytes, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize({
          width: 1920,
          height: 1920,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 85 })
        .toBuffer({ resolveWithObject: true });
      bytes = Buffer.from(result.data);
      width = result.info.width;
      height = result.info.height;
      inspected = {
        mediaKind: "IMAGE",
        mimeType: "image/webp",
        extension: "webp",
      };
    }
    if (!["IMAGE", "VIDEO", "AUDIO"].includes(inspected.mediaKind))
      throw new Error("Use JPG, PNG, WebP, MP4, MP3 or WAV.");
    const objectKey = createAssetObjectKey(
      membership.organizationId,
      inspected.extension,
    );
    pending = await db.$transaction(async (tx) => {
      const created = await createPendingUpload(tx, {
        organizationId: membership.organizationId,
        userId: session.user.id,
        objectKey,
        mediaKind: inspected.mediaKind,
        mimeType: inspected.mimeType,
        byteSize: BigInt(bytes.length),
        originalFilename: file.name,
        storageProvider: "LOCAL",
        name: `Learn: ${file.name}`,
      });
      await tx.asset.update({
        where: { id: created.id },
        data: { purpose: "REFERENCE_INPUT" },
      });
      return created;
    });
    const stored = await storage.put(objectKey, bytes);
    const id = randomUUID();
    const media = await db.$transaction(async (tx) => {
      await finalizeUploadedAsset(tx, {
        assetId: pending!.id,
        organizationId: pending!.organizationId,
        actorUserId: session.user.id,
        actualBytes: stored.byteSize,
        sha256: stored.sha256,
        width,
        height,
      });
      return tx.learnMedia.create({
        data: {
          id,
          assetId: pending!.id,
          alt: String(form.get("alt") ?? "").slice(0, 500),
          caption: String(form.get("caption") ?? "").slice(0, 1000),
          credit: String(form.get("credit") ?? "").slice(0, 500),
        },
      });
    });
    return NextResponse.json(
      { media, kind: inspected.mediaKind, width, height },
      { status: 201 },
    );
  } catch {
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
      {
        error:
          "Upload failed. Use supported media under 25 MB and check your workspace storage allowance.",
      },
      { status: 400 },
    );
  } finally {
    uploading = false;
  }
}
