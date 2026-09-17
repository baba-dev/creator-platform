import { hasPlatformPermission, type PlatformPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import Link from "next/link";
import type { ReactNode } from "react";

import {
  AdminNavigation,
  type AdminNavigationItem,
} from "@/components/admin/admin-navigation";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Brand } from "@/components/ui/brand";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { requirePlatformPermission } from "@/lib/request-auth";

const navigation: readonly (AdminNavigationItem & {
  permission?: PlatformPermission;
})[] = [
  { href: "/admin", label: "Overview", icon: "dashboard" },
  {
    href: "/admin/organizations",
    label: "Organizations",
    icon: "projects",
    permission: "organizations:read",
  },
  {
    href: "/admin/users",
    label: "Users",
    icon: "admin",
    permission: "users:read",
  },
  {
    href: "/admin/payments",
    label: "Payments",
    icon: "credits",
    permission: "payments:read",
  },
  {
    href: "/admin/models",
    label: "Model catalog",
    icon: "sparkles",
    permission: "models:read",
  },
  {
    href: "/admin/jobs",
    label: "Generation jobs",
    icon: "activity",
    permission: "jobs:read",
  },
  {
    href: "/admin/audit",
    label: "Audit log",
    icon: "assets",
    permission: "audit:read",
  },
];

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await requirePlatformPermission("platform:access");
  const canReadPayments = hasPlatformPermission(
    session.user.platformRole,
    "payments:read",
  );
  const pendingPayments = canReadPayments
    ? await db.manualPayment.count({
        where: { method: "CHEQUE", status: "PENDING" },
      })
    : 0;
  const items = navigation
    .filter(
      (item) =>
        !item.permission ||
        hasPlatformPermission(session.user.platformRole, item.permission),
    )
    .map((item) => ({
      ...item,
      badge:
        item.href === "/admin/payments" && pendingPayments > 0
          ? pendingPayments.toLocaleString("en-US")
          : undefined,
    }));
  const roleLabel = session.user.platformRole.replaceAll("_", " ");

  return (
    <main className="relative min-h-screen bg-background text-foreground">
      <div className="relative mx-auto grid min-h-screen max-w-[1800px] xl:grid-cols-[264px_1fr]">
        <aside className="hidden border-r border-border bg-sidebar/90 px-4 py-5 backdrop-blur-xl xl:flex xl:flex-col">
          <div className="px-2">
            <Brand />
          </div>
          <div className="mx-2 mt-7 rounded-xl border border-warning/20 bg-warning/[0.07] px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-lg bg-warning/10 text-warning">
                <Icon name="admin" className="size-4" />
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-warning">
                  Operations console
                </p>
                <p className="text-[9px] text-muted-foreground">
                  Restricted platform access
                </p>
              </div>
            </div>
          </div>
          <AdminNavigation items={items} />
          <div className="mt-auto rounded-2xl border border-border bg-card p-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Signed in with
            </p>
            <p className="mt-2 text-xs font-semibold">{roleLabel}</p>
            <p className="mt-1 truncate text-[10px] text-muted-foreground">
              {session.user.email}
            </p>
            <div className="mt-3 border-t border-border pt-2">
              <SignOutButton />
            </div>
          </div>
        </aside>
        <div className="min-w-0">
          <header className="sticky top-0 z-30 flex min-h-[72px] items-center justify-between gap-4 border-b border-border bg-background/85 px-4 backdrop-blur-xl sm:px-7 lg:px-9">
            <div className="flex items-center gap-3">
              <div className="xl:hidden">
                <Brand compact />
              </div>
              <div className="max-[480px]:hidden">
                <p className="text-sm font-semibold">Platform administration</p>
                <p className="mt-0.5 hidden text-[10px] uppercase tracking-[0.12em] text-muted-foreground sm:block">
                  Aiwa Creators · Operations
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Button asChild variant="secondary" size="sm">
                <Link href="/app">Workspace</Link>
              </Button>
            </div>
          </header>
          <AdminNavigation items={items} mobile />
          {children}
        </div>
      </div>
    </main>
  );
}
