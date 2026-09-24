import { db } from "@aiwa/db";
import { createProject } from "@aiwa/organizations";
import { NextResponse } from "next/server";
import { z } from "zod";

import { projectApiError } from "@/lib/project-api";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

const projectSchema = z
  .object({
    organizationId: z.string().min(1).max(100),
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

async function membershipFor(userId: string, organizationId: string) {
  return db.membership.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    include: { organization: true },
  });
}

export async function GET(request: Request) {
  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId") ?? "";
  const includeArchived = url.searchParams.get("includeArchived") === "true";
  const membership = await membershipFor(session.user.id, organizationId);
  if (!membership || membership.organization.status !== "ACTIVE") {
    return NextResponse.json({ error: "Workspace access denied." }, { status: 403 });
  }
  const projects = await db.project.findMany({
    where: {
      organizationId,
      ...(includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: [{ archivedAt: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      name: true,
      description: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { generationJobs: true, assets: true } },
    },
  });
  return NextResponse.json(
    {
      projects: projects.map((project) => ({
        ...project,
        archivedAt: project.archivedAt?.toISOString() ?? null,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request)) {
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  }
  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  try {
    const text = await request.text();
    if (text.length > 6000) {
      return NextResponse.json({ error: "Request too large." }, { status: 413 });
    }
    const input = projectSchema.parse(JSON.parse(text));
    const membership = await membershipFor(session.user.id, input.organizationId);
    if (!membership) {
      return NextResponse.json({ error: "Workspace access denied." }, { status: 403 });
    }
    const project = await createProject({
      actor: {
        userId: session.user.id,
        platformRole: session.user.platformRole,
        organizationId: input.organizationId,
        organizationRole: membership.role,
      },
      organizationId: input.organizationId,
      name: input.name,
      description: input.description,
    });
    return NextResponse.json(
      {
        project: {
          ...project,
          archivedAt: project.archivedAt?.toISOString() ?? null,
          createdAt: project.createdAt.toISOString(),
          updatedAt: project.updatedAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return projectApiError(error);
  }
}
