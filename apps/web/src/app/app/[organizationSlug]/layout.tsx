import type { ReactNode } from "react";
import { Brand } from "@/components/ui/brand";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { WorkspaceNavigation } from "@/components/studio/workspace-navigation";
import { requireOrganizationPermission } from "@/lib/request-auth";

export default async function OrganizationLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const { membership } = await requireOrganizationPermission(
    organizationSlug,
    "workspace:view",
  );
  return (
    <div className="min-h-screen min-w-0 bg-background text-foreground lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="hidden border-r border-border bg-sidebar/90 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="px-5 py-3">
          <Brand href={`/app/${organizationSlug}`} />
        </div>
        <WorkspaceNavigation slug={organizationSlug} />
        <div className="mt-auto border-t border-border p-5 text-xs text-muted-foreground">
          {membership.organization.name}
        </div>
      </aside>
      <div className="min-w-0 overflow-x-clip">
        <header className="hidden min-h-[64px] items-center justify-between border-b border-border bg-background/85 px-8 backdrop-blur-xl lg:flex">
          <span className="truncate text-sm font-semibold text-foreground">
            {membership.organization.name}
          </span>
          <ThemeToggle />
        </header>
        <div className="sticky top-0 z-40 lg:hidden">
          <div className="flex min-h-[64px] items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur-xl">
            <Brand compact href={`/app/${organizationSlug}`} />
            <ThemeToggle />
          </div>
          <WorkspaceNavigation slug={organizationSlug} />
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
