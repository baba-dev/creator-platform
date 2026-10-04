import type { ReactNode } from "react";
import { hasOrganizationPermission } from "@aiwa/authz";
import { getAssistantSettings } from "@aiwa/assistant";
import { db } from "@aiwa/db";
import { GenerationActivityCenter } from "@/components/process/generation-activity-center";
import { AssistantWidget } from "@/components/assistant/assistant-widget";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { PrimaryMenu } from "@/components/navigation/primary-menu";
import { UserHeaderMenu } from "@/components/navigation/user-header-menu";
import { MobileHeader } from "@/components/navigation/mobile-header";
import { WorkspaceShell } from "@/components/navigation/workspace-shell";
import { requireOrganizationPermission } from "@/lib/request-auth";

async function navigationQueryOrEmpty<T>(
  label: string,
  query: Promise<T[]>,
): Promise<T[]> {
  try {
    return await query;
  } catch (error) {
    console.error(`[workspace-navigation] Failed to load ${label}`, error);
    return [];
  }
}

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
      navigationQueryOrEmpty(
        "projects",
        db.project.findMany({
          where: {
            organizationId: membership.organizationId,
            archivedAt: null,
          },
          select: { id: true, name: true },
          orderBy: { updatedAt: "desc" },
          take: 15,
        }),
      ),
      navigationQueryOrEmpty(
        "chat threads",
        db.chatThread.findMany({
          where: {
            organizationId: membership.organizationId,
            createdById: session.user.id,
          },
          select: { id: true, title: true, threadType: true, updatedAt: true },
          orderBy: { updatedAt: "desc" },
          take: 30,
        }),
      ),
      navigationQueryOrEmpty(
        "favorite assets",
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
      ),
    ]);

  const canUseAssistant = hasOrganizationPermission(
    membership.role,
    "generation:create",
  );

  const credits = membership.organization.wallet?.balanceCache ?? 0n;
  const user = {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image ?? null,
  };
  const organization = {
    id: membership.organization.id,
    name: membership.organization.name,
    slug: membership.organization.slug,
  };

  const threads = rawThreads.map((thread) => ({
    id: thread.id,
    title: thread.title,
    threadType: thread.threadType,
    updatedAt: thread.updatedAt.toISOString(),
  }));

  const favoriteAssets = rawFavorites.map((favorite) => ({
    id: favorite.asset.id,
    title: favorite.asset.name,
    mimeType: favorite.asset.mimeType,
  }));

  return (
    <WorkspaceShell
      sidebarProps={{
        slug: organizationSlug,
        user,
        organization,
        credits,
        initialProjects: projects,
        initialThreads: threads,
        initialFavoriteAssets: favoriteAssets,
      }}
      header={
        <header className="relative z-40 hidden min-h-[64px] items-center justify-between overflow-visible border-b border-border bg-background/85 px-6 backdrop-blur-xl lg:flex">
          <PrimaryMenu slug={organizationSlug} />

          <div className="flex items-center gap-3">
            <UserHeaderMenu
              slug={organizationSlug}
              user={user}
              organization={organization}
              role={membership.role}
            />
            <ThemeToggle />
          </div>
        </header>
      }
      mobileHeader={
        <MobileHeader
          slug={organizationSlug}
          user={user}
          organization={organization}
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
