import { db } from "@aiwa/db";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAssetMembership } from "@/lib/asset-api";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

const schema = z
  .object({
    organizationId: z.string().min(1).max(100),
    name: z.string().trim().min(1).max(80),
    parentId: z.string().max(100).nullable().optional(),
  })
  .strict();

export async function GET(request: Request) {
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId") ?? "";
  const membership = await requireAssetMembership(
    session,
    organizationId,
    false,
  );
  if (!membership)
    return NextResponse.json(
      { error: "Workspace access denied." },
      { status: 403 },
    );
  const folders = await db.assetFolder.findMany({
    where: { organizationId },
    orderBy: [{ parentId: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      parentId: true,
      _count: { select: { assets: true } },
    },
  });
  return NextResponse.json(
    { folders },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

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
    const input = schema.parse(await request.json());
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
    if (input.parentId) {
      const parent = await db.assetFolder.findFirst({
        where: { id: input.parentId, organizationId: input.organizationId },
        select: { id: true },
      });
      if (!parent) throw new Error("Parent folder is unavailable.");
    }
    const duplicate = await db.assetFolder.findFirst({
      where: {
        organizationId: input.organizationId,
        parentId: input.parentId ?? null,
        name: input.name,
      },
      select: { id: true },
    });
    if (duplicate)
      throw new Error("A folder with this name already exists here.");
    const folder = await db.assetFolder.create({
      data: {
        organizationId: input.organizationId,
        name: input.name,
        parentId: input.parentId ?? null,
      },
    });
    return NextResponse.json({ folder }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to create folder.",
      },
      { status: 400 },
    );
  }
}
