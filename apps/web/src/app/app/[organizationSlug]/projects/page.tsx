import { hasOrganizationPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import Link from "next/link";

import { ProjectManager, type ProjectRow } from "@/components/projects/project-manager";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Brand } from "@/components/ui/brand";
import { requireOrganizationPermission } from "@/lib/request-auth";

export default async function ProjectsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const { membership } = await requireOrganizationPermission(
    organizationSlug,
    "projects:read",
  );
  const projects = await db.project.findMany({
    where: { organizationId: membership.organizationId },
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
  const rows: ProjectRow[] = projects.map((project) => ({
    id: project.id,
    name: project.name,
    description: project.description,
    archivedAt: project.archivedAt?.toISOString() ?? null,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    generationCount: project._count.generationJobs,
    assetCount: project._count.assets,
  }));

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 flex min-h-[72px] items-center justify-between border-b border-border bg-background/85 px-4 backdrop-blur-xl sm:px-7 lg:px-10">
        <Brand />
        <ThemeToggle />
      </header>
      <div className="mx-auto max-w-[1500px] px-4 py-8 sm:px-7 lg:px-10">
        <Link
          href={`/app/${organizationSlug}`}
          className="inline-flex min-h-10 items-center text-sm font-semibold text-primary"
        >
          ← Workspace
        </Link>
        <div className="mt-4">
          <ProjectManager
            organizationId={membership.organizationId}
            organizationSlug={organizationSlug}
            canWrite={hasOrganizationPermission(membership.role, "projects:write")}
            initialProjects={rows}
          />
        </div>
      </div>
    </main>
  );
}
