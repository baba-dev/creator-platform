import { hasPlatformPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";

import {
  TemplateManager,
  type AdminTemplateRow,
} from "@/components/admin/template-manager";
import { Eyebrow } from "@/components/ui/creative";
import { requirePlatformPermission } from "@/lib/request-auth";

export default async function AdminTemplatesPage() {
  const session = await requirePlatformPermission("templates:read");
  const templates = await db.generationTemplate.findMany({
    orderBy: [{ status: "asc" }, { featured: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      category: true,
      mediaKind: true,
      status: true,
      promptTemplate: true,
      variables: true,
      defaultInput: true,
      preferredModelId: true,
      featured: true,
      sortOrder: true,
      updatedAt: true,
      _count: { select: { generationJobs: true } },
    },
  });

  const rows: AdminTemplateRow[] = templates.map(({ _count, updatedAt, ...template }) => ({
    ...template,
    mediaKind: template.mediaKind as "IMAGE" | "VIDEO" | "VOICE",
    usageCount: _count.generationJobs,
    updatedAt: updatedAt.toISOString(),
  }));

  return (
    <div className="px-4 py-7 sm:px-7 lg:px-9 lg:py-9">
      <section className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Eyebrow>Creative catalog</Eyebrow>
          <h1 className="font-display mt-3 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
            Generation templates.
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Curate safe, capability-aware starting points for image, video and
            voice creation. Published templates become immediately discoverable
            to customer workspaces.
          </p>
        </div>
      </section>
      <TemplateManager
        templates={rows}
        canManage={hasPlatformPermission(
          session.user.platformRole,
          "templates:manage",
        )}
      />
    </div>
  );
}
