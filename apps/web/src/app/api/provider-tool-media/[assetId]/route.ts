import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

import {
  LocalAssetStorage,
  resolveAssetStorageForAsset,
  resolveLocalAssetPath,
} from "@aiwa/assets/storage";
import { parseServerEnv } from "@aiwa/config";
import { db } from "@aiwa/db";
import { verifyProviderToolMediaGrant } from "@aiwa/generation/provider-media-grant";
import { z } from "zod";

export const runtime = "nodejs";

const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const MAX_PROVIDER_VIDEO_BYTES = 100_000_000;

async function serve(request: Request, assetId: string, head: boolean) {
  const url = new URL(request.url);
  const executionId = url.searchParams.get("executionId") ?? "";
  const grant = url.searchParams.get("grant") ?? "";
  if (
    !identifier.safeParse(assetId).success ||
    !identifier.safeParse(executionId).success ||
    grant.length > 120
  )
    return new Response(null, { status: 404 });

  const env = parseServerEnv();
  if (
    !verifyProviderToolMediaGrant({
      secret: env.AUTH_SECRET,
      executionId,
      assetId,
      token: grant,
    })
  )
    return new Response(null, { status: 404 });

  const input = await db.providerToolInputAsset.findUnique({
    where: { executionId_assetId: { executionId, assetId } },
    select: {
      execution: {
        select: { organizationId: true, createdById: true, status: true },
      },
      asset: {
        select: {
          id: true,
          organizationId: true,
          status: true,
          storageProvider: true,
          mediaKind: true,
          mimeType: true,
          purpose: true,
          storageOwnerUserId: true,
          objectKey: true,
          externalFileId: true,
        },
      },
    },
  });
  const asset = input?.asset;
  const execution = input?.execution;
  if (
    !asset ||
    !execution ||
    asset.organizationId !== execution.organizationId ||
    !["SUBMITTING", "PROCESSING"].includes(execution.status) ||
    asset.status !== "READY" ||
    asset.mediaKind !== "VIDEO" ||
    (asset.purpose === "REFERENCE_INPUT" &&
      asset.storageOwnerUserId !== execution.createdById)
  )
    return new Response(null, { status: 404 });

  try {
    const storage = await resolveAssetStorageForAsset(db, asset, {
      storageRoot: env.ASSET_STORAGE_ROOT,
      encryptionKey: env.STORAGE_ENCRYPTION_KEY,
      googleClientId: env.GOOGLE_DRIVE_CLIENT_ID,
      googleClientSecret: env.GOOGLE_DRIVE_CLIENT_SECRET,
      onedriveClientId: env.ONEDRIVE_CLIENT_ID,
      onedriveClientSecret: env.ONEDRIVE_CLIENT_SECRET,
    });
    const size = Number(
      (await storage.stat(asset.objectKey, asset.externalFileId ?? undefined))
        .byteSize,
    );
    if (
      !Number.isSafeInteger(size) ||
      size <= 0 ||
      size > MAX_PROVIDER_VIDEO_BYTES
    )
      return new Response(null, { status: 503 });

    const extension =
      asset.mimeType === "video/webm"
        ? "webm"
        : asset.mimeType === "video/quicktime"
          ? "mov"
          : "mp4";
    const headers = new Headers({
      "Content-Type": asset.mimeType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Content-Disposition": `inline; filename="${asset.id}.${extension}"`,
      "Accept-Ranges": "bytes",
    });

    let start = 0;
    let end = size - 1;
    let status = 200;
    const range = request.headers.get("range");
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      const left = match?.[1] ? Number(match[1]) : null;
      const right = match?.[2] ? Number(match[2]) : null;
      if (
        !match ||
        (left === null && right === null) ||
        (left !== null && !Number.isSafeInteger(left)) ||
        (right !== null && !Number.isSafeInteger(right)) ||
        (left === null && (right === null || right < 1))
      ) {
        headers.set("Content-Range", `bytes */${size}`);
        return new Response(null, { status: 416, headers });
      }
      start = left === null ? Math.max(0, size - right!) : left;
      end = left === null ? size - 1 : Math.min(right ?? size - 1, size - 1);
      if (start >= size || end < start) {
        headers.set("Content-Range", `bytes */${size}`);
        return new Response(null, { status: 416, headers });
      }
      headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
      status = 206;
    }
    headers.set("Content-Length", String(end - start + 1));
    if (head) return new Response(null, { status, headers });

    if (storage instanceof LocalAssetStorage) {
      const localPath = resolveLocalAssetPath(
        env.ASSET_STORAGE_ROOT,
        asset.objectKey,
      );
      const stream = Readable.toWeb(
        createReadStream(localPath, { start, end }),
      ) as ReadableStream<Uint8Array>;
      return new Response(stream, { status, headers });
    }
    const bytes = await storage.readRange(
      asset.objectKey,
      start,
      end,
      asset.externalFileId ?? undefined,
    );
    return new Response(new Uint8Array(bytes), { status, headers });
  } catch {
    return new Response(null, { status: 503 });
  }
}

type Context = { params: Promise<{ assetId: string }> };

export async function GET(request: Request, context: Context) {
  return serve(request, (await context.params).assetId, false);
}

export async function HEAD(request: Request, context: Context) {
  return serve(request, (await context.params).assetId, true);
}
