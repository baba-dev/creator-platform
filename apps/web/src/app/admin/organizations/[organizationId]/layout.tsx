import { db } from "@aiwa/db";
import { hasPlatformPermission } from "@aiwa/authz";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { requirePlatformPermission } from "@/lib/request-auth";
export default async function OrganizationLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ organizationId: string }>;
}) {
  const session = await requirePlatformPermission("organizations:read");
  const { organizationId } = await params;
  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: { name: true, slug: true, status: true },
  });
  if (!organization) notFound();
  const tabs = [
    { label: "Overview" },
    { label: "Members" },
    { label: "Wallet" },
    { label: "Payments", permission: "payments:read" as const },
    { label: "Jobs", permission: "jobs:read" as const },
    { label: "Assets" },
  ].filter(
    (tab) =>
      !tab.permission ||
      hasPlatformPermission(session.user.platformRole, tab.permission),
  );
  return (
    <div>
      <header className="px-4 pt-8 sm:px-7 lg:px-9">
        <Link href="/admin/organizations" className="text-sm text-primary">
          ← Organizations
        </Link>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-4xl font-semibold">
            {organization.name}
          </h1>
          <span className="rounded-full border border-border px-3 py-1 text-xs">
            {organization.status}
          </span>
        </div>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          {organization.slug}
        </p>
        <nav
          className="mt-6 flex gap-1 overflow-x-auto border-b border-border"
          aria-label="Organization detail"
        >
          {tabs.map((tab) => (
            <Link
              key={tab.label}
              className="min-h-10 shrink-0 px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-primary"
              href={
                tab.label === "Overview"
                  ? `/admin/organizations/${organizationId}`
                  : `/admin/organizations/${organizationId}/${tab.label.toLowerCase()}`
              }
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </div>
  );
}
