import { normalizeTagName } from "@aiwa/assets";
import { db } from "@aiwa/db";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAssetMembership } from "@/lib/asset-api";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

const schema = z
  .object({
    organizationId: z.string().min(1).max(100),
    name: z.string().trim().min(1).max(48),
  })
  .strict();

export async function GET(request: Request) {
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const organizationId =
    new URL(request.url).searchParams.get("organizationId") ?? "";
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
  const tags = await db.assetTag.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, _count: { select: { assignments: true } } },
  });
  return NextResponse.json(
    { tags },
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
    const normalized = normalizeTagName(input.name);
    const tag = await db.assetTag.upsert({
      where: {
        organizationId_normalizedName: {
          organizationId: input.organizationId,
          normalizedName: normalized.normalizedName,
        },
      },
      create: { organizationId: input.organizationId, ...normalized },
      update: { name: normalized.name },
    });
    return NextResponse.json({ tag }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to create tag.",
      },
      { status: 400 },
    );
  }
}
