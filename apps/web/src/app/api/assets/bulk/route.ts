import {
  assignAssets,
  MAX_ASSET_BULK_SELECTION,
  normalizeTagName,
  restoreAssets,
  trashAssets,
} from "@aiwa/assets";
import { db } from "@aiwa/db";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAssetMembership } from "@/lib/asset-api";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

const base = {
  organizationId: z.string().min(1).max(100),
  assetIds: z
    .array(z.string().min(1).max(100))
    .min(1)
    .max(MAX_ASSET_BULK_SELECTION),
};

const schema = z.discriminatedUnion("action", [
  z.object({ ...base, action: z.literal("trash") }).strict(),
  z.object({ ...base, action: z.literal("restore") }).strict(),
  z
    .object({
      ...base,
      action: z.literal("project"),
      projectId: z.string().max(100).nullable(),
    })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal("folder"),
      folderId: z.string().max(100).nullable(),
    })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal("add-tag"),
      tagName: z.string().trim().min(1).max(48),
    })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal("remove-tag"),
      tagId: z.string().min(1).max(100),
    })
    .strict(),
]);

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request))
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );

  try {
    const text = await request.text();
    if (text.length > 20_000)
      return NextResponse.json(
        { error: "Request too large." },
        { status: 413 },
      );
    const input = schema.parse(JSON.parse(text));
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

    const uniqueIds = [...new Set(input.assetIds)];
    let count = 0;
    if (input.action === "trash") {
      count = await db.$transaction((tx) =>
        trashAssets(tx, {
          organizationId: input.organizationId,
          assetIds: uniqueIds,
        }),
      );
    } else if (input.action === "restore") {
      count = await db.$transaction((tx) =>
        restoreAssets(tx, {
          organizationId: input.organizationId,
          assetIds: uniqueIds,
        }),
      );
    } else if (input.action === "project") {
      count = await db.$transaction((tx) =>
        assignAssets(tx, {
          organizationId: input.organizationId,
          assetIds: uniqueIds,
          projectId: input.projectId,
        }),
      );
    } else if (input.action === "folder") {
      count = await db.$transaction((tx) =>
        assignAssets(tx, {
          organizationId: input.organizationId,
          assetIds: uniqueIds,
          folderId: input.folderId,
        }),
      );
    } else if (input.action === "add-tag") {
      const normalized = normalizeTagName(input.tagName);
      count = await db.$transaction(async (tx) => {
        const tag = await tx.assetTag.upsert({
          where: {
            organizationId_normalizedName: {
              organizationId: input.organizationId,
              normalizedName: normalized.normalizedName,
            },
          },
          create: { organizationId: input.organizationId, ...normalized },
          update: { name: normalized.name },
        });
        const assets = await tx.asset.findMany({
          where: {
            id: { in: uniqueIds },
            organizationId: input.organizationId,
            status: { in: ["READY", "DELETED"] },
          },
          select: { id: true },
        });
        await Promise.all(
          assets.map((asset) =>
            tx.assetTagAssignment.upsert({
              where: { assetId_tagId: { assetId: asset.id, tagId: tag.id } },
              create: { assetId: asset.id, tagId: tag.id },
              update: {},
            }),
          ),
        );
        return assets.length;
      });
    } else {
      const result = await db.assetTagAssignment.deleteMany({
        where: {
          tagId: input.tagId,
          assetId: {
            in: await db.asset
              .findMany({
                where: {
                  id: { in: uniqueIds },
                  organizationId: input.organizationId,
                },
                select: { id: true },
              })
              .then((rows) => rows.map((row) => row.id)),
          },
        },
      });
      count = result.count;
    }

    await db.auditEvent.create({
      data: {
        actorUserId: session.user.id,
        organizationId: input.organizationId,
        action: `asset.bulk.${input.action}`,
        targetType: "Asset",
        metadata: { requested: uniqueIds.length, changed: count },
      },
    });
    return NextResponse.json({ count });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Bulk operation failed.",
      },
      { status: 400 },
    );
  }
}
