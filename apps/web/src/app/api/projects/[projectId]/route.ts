import { db } from "@aiwa/db";
import { setProjectArchived, updateProject } from "@aiwa/organizations";
import { NextResponse } from "next/server";
import { z } from "zod";

import { projectApiError } from "@/lib/project-api";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

const updateSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("update"),
      organizationId: z.string().min(1).max(100),
      name: z.string().trim().min(1).max(80),
      description: z.string().trim().max(2000).nullable().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("archive"),
      organizationId: z.string().min(1).max(100),
      archived: z.boolean(),
    })
    .strict(),
]);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
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
    const input = updateSchema.parse(JSON.parse(text));
    const { projectId } = await context.params;
    const membership = await db.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: input.organizationId,
          userId: session.user.id,
        },
      },
    });
    if (!membership) {
      return NextResponse.json({ error: "Workspace access denied." }, { status: 403 });
    }
    const actor = {
      userId: session.user.id,
      platformRole: session.user.platformRole,
      organizationId: input.organizationId,
      organizationRole: membership.role,
    };
    const project =
      input.action === "update"
        ? await updateProject({
            actor,
            organizationId: input.organizationId,
            projectId,
            name: input.name,
            description: input.description,
          })
        : await setProjectArchived({
            actor,
            organizationId: input.organizationId,
            projectId,
            archived: input.archived,
          });
    return NextResponse.json({
      project: {
        ...project,
        archivedAt: project.archivedAt?.toISOString() ?? null,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    return projectApiError(error);
  }
}
