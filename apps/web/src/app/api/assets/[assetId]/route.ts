import { normalizeAssetName, normalizeTagName } from "@aiwa/assets";
import { db } from "@aiwa/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMembership } from "@aiwa/generation";
import {
  readStoredAsset,
  readStoredAssetRange,
  storedAssetSize,
} from "@aiwa/generation/storage";
import { requireAssetMembership } from "@/lib/asset-api";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const session = await getRequestSession(request.headers);
  if (!session) return new Response(null, { status: 401 });
  const { assetId } = await params;
  const asset = await db.asset.findFirst({
    where: { id: assetId, status: { in: ["READY", "DELETED"] } },
  });
  if (!asset) return new Response(null, { status: 404 });
  if (
    asset.purpose === "REFERENCE_INPUT" &&
    asset.storageOwnerUserId !== session.user.id
  ) {
    return new Response(null, { status: 404 });
  }
  try {
    await requireMembership(db, asset.organizationId, session.user.id);
  } catch {
    return new Response(null, { status: 404 });
  }
  try {
    const isVideo = asset.mimeType.startsWith("video/");
    const isAudio = asset.mimeType.startsWith("audio/");
    const isMedia = isVideo || isAudio;
    const ext = isVideo
      ? "mp4"
      : isAudio
        ? "mp3"
        : asset.mimeType === "image/jpeg"
          ? "jpg"
          : "png";
    const download = new URL(request.url).searchParams.has("download");
    const range = !download && isMedia ? request.headers.get("range") : null;
    let body: Buffer;
    let status = 200;
    const headers = new Headers({
      "Content-Type": asset.mimeType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${asset.id}.${ext}"`,
    });

    if (isMedia) headers.set("Accept-Ranges", "bytes");
    if (range) {
      const byteSize = await storedAssetSize(asset.objectKey);
      const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (!match) {
        headers.set("Content-Range", `bytes */${byteSize}`);
        return new Response(null, { status: 416, headers });
      }
      const isSuffixRange = !match[1];
      const requestedStart = match[1] ? Number(match[1]) : 0;
      const requestedEnd = match[2] ? Number(match[2]) : byteSize - 1;
      const start = isSuffixRange
        ? Math.max(0, byteSize - requestedEnd)
        : requestedStart;
      const end = isSuffixRange
        ? byteSize - 1
        : Math.min(requestedEnd, byteSize - 1);
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 0 ||
        (isSuffixRange && requestedEnd <= 0) ||
        start > end ||
        start >= byteSize
      ) {
        headers.set("Content-Range", `bytes */${byteSize}`);
        return new Response(null, { status: 416, headers });
      }
      body = await readStoredAssetRange(asset.objectKey, start, end);
      status = 206;
      headers.set("Content-Range", `bytes ${start}-${end}/${byteSize}`);
    } else body = await readStoredAsset(asset.objectKey);

    headers.set("Content-Length", String(body.length));
    return new Response(new Uint8Array(body), {
      status,
      headers,
    });
  } catch {
    return new Response(null, { status: 503 });
  }
}

const patchSchema = z
  .object({
    organizationId: z.string().min(1).max(100),
    name: z.string().trim().max(191).optional(),
    projectId: z.string().max(100).nullable().optional(),
    folderId: z.string().max(100).nullable().optional(),
    favorite: z.boolean().optional(),
    addTag: z.string().trim().min(1).max(48).optional(),
    removeTagId: z.string().min(1).max(100).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.name !== undefined ||
      value.projectId !== undefined ||
      value.folderId !== undefined ||
      value.favorite !== undefined ||
      value.addTag !== undefined ||
      value.removeTagId !== undefined,
    "No changes supplied.",
  );

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  if (!hasTrustedMutationOrigin(request))
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );

  try {
    const input = patchSchema.parse(await request.json());
    const membership = await requireAssetMembership(
      session,
      input.organizationId,
      true,
    );
    if (!membership)
      return NextResponse.json(
        { error: "Workspace access denied." },
        { status: 403 },
      );

    const { assetId } = await params;
    const existing = await db.asset.findFirst({
      where: {
        id: assetId,
        organizationId: input.organizationId,
        status: { in: ["READY", "DELETED"] },
      },
      select: { id: true },
    });
    if (!existing)
      return NextResponse.json({ error: "Asset not found." }, { status: 404 });

    const asset = await db.$transaction(async (tx) => {
      if (input.projectId) {
        const project = await tx.project.findFirst({
          where: {
            id: input.projectId,
            organizationId: input.organizationId,
            archivedAt: null,
          },
          select: { id: true },
        });
        if (!project) throw new Error("Project is unavailable.");
      }
      if (input.folderId) {
        const folder = await tx.assetFolder.findFirst({
          where: {
            id: input.folderId,
            organizationId: input.organizationId,
          },
          select: { id: true },
        });
        if (!folder) throw new Error("Folder is unavailable.");
      }

      const data: Record<string, unknown> = {};
      if (input.name !== undefined)
        data.name = normalizeAssetName(input.name, "Untitled asset");
      if (input.projectId !== undefined) data.projectId = input.projectId;
      if (input.folderId !== undefined) data.folderId = input.folderId;

      if (Object.keys(data).length) {
        await tx.asset.update({ where: { id: assetId }, data });
      }

      if (input.favorite !== undefined) {
        if (input.favorite) {
          await tx.assetFavorite.upsert({
            where: {
              assetId_userId: { assetId, userId: session.user.id },
            },
            create: { assetId, userId: session.user.id },
            update: {},
          });
        } else {
          await tx.assetFavorite.deleteMany({
            where: { assetId, userId: session.user.id },
          });
        }
      }

      if (input.addTag) {
        const normalized = normalizeTagName(input.addTag);
        const tag = await tx.assetTag.upsert({
          where: {
            organizationId_normalizedName: {
              organizationId: input.organizationId,
              normalizedName: normalized.normalizedName,
            },
          },
          create: {
            organizationId: input.organizationId,
            ...normalized,
          },
          update: { name: normalized.name },
        });
        await tx.assetTagAssignment.upsert({
          where: { assetId_tagId: { assetId, tagId: tag.id } },
          create: { assetId, tagId: tag.id },
          update: {},
        });
      }
      if (input.removeTagId) {
        await tx.assetTagAssignment.deleteMany({
          where: {
            assetId,
            tagId: input.removeTagId,
            tag: { organizationId: input.organizationId },
          },
        });
      }

      return tx.asset.findUniqueOrThrow({
        where: { id: assetId },
        include: {
          project: { select: { id: true, name: true } },
          folder: { select: { id: true, name: true } },
          tagAssignments: {
            include: { tag: { select: { id: true, name: true } } },
          },
          favorites: {
            where: { userId: session.user.id },
            select: { userId: true },
          },
        },
      });
    });

    await db.auditEvent.create({
      data: {
        actorUserId: session.user.id,
        organizationId: input.organizationId,
        action: "asset.updated",
        targetType: "Asset",
        targetId: assetId,
      },
    });

    return NextResponse.json({
      asset: {
        ...asset,
        byteSize: asset.byteSize.toString(),
        createdAt: asset.createdAt.toISOString(),
        updatedAt: asset.updatedAt.toISOString(),
        deletedAt: asset.deletedAt?.toISOString() ?? null,
        purgeAfter: asset.purgeAfter?.toISOString() ?? null,
        favorite: asset.favorites.length > 0,
        tags: asset.tagAssignments.map(({ tag }) => tag),
        favorites: undefined,
        tagAssignments: undefined,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to update asset.",
      },
      { status: 400 },
    );
  }
}
