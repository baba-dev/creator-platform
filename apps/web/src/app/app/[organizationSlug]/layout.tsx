import type { ReactNode } from "react";
import { hasOrganizationPermission } from "@aiwa/authz";
import { getAssistantSettings } from "@aiwa/assistant";
import { db } from "@aiwa/db";
import { GenerationActivityCenter } from "@/components/process/generation-activity-center";
import { AssistantWidget } from "@/components/assistant/assistant-widget";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { PrimaryMenu } from "@/components/navigation/primary-menu";
import { UserHeaderMenu } from "@/components/navigation/user-header-menu";
import { ChatGPTAppSidebar } from "@/components/navigation/chatgpt-sidebar";
import { MobileHeader } from "@/components/navigation/mobile-header";
import { WorkspaceShell } from "@/components/navigation/workspace-shell";
import { requireOrganizationPermission } from "@/lib/request-auth";

export default async function OrganizationLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const { session, membership } = await requireOrganizationPermission(
    organizationSlug,
    "workspace:view",
  );

  const [assistantSettings, projects, rawThreads, rawFavorites] =
    await Promise.all([
      getAssistantSettings(),
      db.project.findMany({
        where: {
          organizationId: membership.organizationId,
          archivedAt: null,
        },
        select: { id: true, name: true },
        orderBy: { updatedAt: "desc" },
        take: 15,
      }),
      db.chatThread.findMany({
        where: {
          organizationId: membership.organizationId,
          createdById: session.user.id,
        },
        select: { id: true, title: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 30,
      }),
      db.assetFavorite.findMany({
        where: {
          userId: session.user.id,
          asset: {
            organizationId: membership.organizationId,
            status: "READY",
            deletedAt: null,
          },
        },
        include: {
          asset: { select: { id: true, name: true, mimeType: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

  const canUseAssistant = hasOrganizationPermission(
    membership.role,
    "generation:create",
  );

  const credits = membership.organization.wallet?.balanceCache ?? 0n;

  const threads = rawThreads.map((t) => ({
    id: t.id,
    title: t.title,
    updatedAt: t.updatedAt.toISOString(),
  }));

  const favoriteAssets = rawFavorites.map((f) => ({
    id: f.asset.id,
    title: f.asset.name,
    mimeType: f.asset.mimeType,
  }));

  return (
    <WorkspaceShell
      sidebar={(collapsed, toggleCollapse) => (
        <ChatGPTAppSidebar
          slug={organizationSlug}
          user={session.user}
          organization={membership.organization}
          credits={credits}
          initialProjects={projects}
          initialThreads={threads}
          initialFavoriteAssets={favoriteAssets}
          isCollapsed={collapsed}
          onToggleCollapse={toggleCollapse}
        />
      )}
      header={
        <header className="hidden min-h-[64px] items-center justify-between border-b border-border bg-background/85 px-6 backdrop-blur-xl lg:flex">
          {/* Menu Location 1: Primary Creation Menu */}
          <PrimaryMenu slug={organizationSlug} />

          {/* Menu Location 2: Right Side Username Menu + Theme Toggle */}
          <div className="flex items-center gap-3">
            <UserHeaderMenu
              slug={organizationSlug}
              user={session.user}
              organization={membership.organization}
              role={membership.role}
            />
            <ThemeToggle />
          </div>
        </header>
      }
      mobileHeader={
        <MobileHeader
          slug={organizationSlug}
          user={session.user}
          organization={membership.organization}
          role={membership.role}
          credits={credits}
          initialProjects={projects}
          initialThreads={threads}
          initialFavoriteAssets={favoriteAssets}
        />
      }
      activityCenter={
        <GenerationActivityCenter
          organizationId={membership.organizationId}
          organizationSlug={organizationSlug}
        />
      }
      assistantWidget={
        canUseAssistant &&
        assistantSettings.enabled &&
        assistantSettings.providerModel ? (
          <AssistantWidget
            organizationId={membership.organizationId}
            organizationSlug={organizationSlug}
          />
        ) : null
      }
    >
      {children}
    </WorkspaceShell>
  );
}
