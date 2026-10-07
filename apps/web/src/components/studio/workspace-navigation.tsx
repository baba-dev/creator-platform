"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icon";
import {
  WORKSPACE_SECONDARY_ITEMS,
  WORKSPACE_TOOLS,
  getWorkspaceBase,
  getWorkspaceItemHref,
  isWorkspaceItemActive,
} from "@/lib/workspace-tools";

interface WorkspaceNavigationItem {
  label: string;
  segment: string;
  icon: IconName;
  matchDescendants?: boolean;
}

const items: readonly WorkspaceNavigationItem[] = [
  { label: "Home", segment: "", icon: "dashboard" },
  ...WORKSPACE_TOOLS.map((item) => ({
    label: item.shortTitle,
    segment: item.segment,
    icon: item.icon,
    matchDescendants: item.matchDescendants,
  })),
  ...WORKSPACE_SECONDARY_ITEMS.map((item) => ({
    label: item.shortTitle,
    segment: item.segment,
    icon: item.icon,
    matchDescendants: item.matchDescendants,
  })),
];

function isActiveItem(
  pathname: string,
  base: string,
  item: WorkspaceNavigationItem,
): boolean {
  if (!item.segment) return pathname === base;
  return isWorkspaceItemActive(pathname, base, item);
}

export function WorkspaceNavigation({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = getWorkspaceBase(slug);

  return (
    <>
      <nav
        aria-label="Workspace navigation"
        className="hidden space-y-1 p-3 lg:block"
      >
        {items.map((item) => {
          const href = item.segment ? getWorkspaceItemHref(base, item) : base;
          const active = isActiveItem(pathname, base, item);

          return (
            <Link
              key={item.segment || "home"}
              href={href as Route}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-card hover:text-foreground"
              }`}
            >
              <Icon name={item.icon} className="size-[18px]" />
              {item.label}
              {active ? (
                <span className="ml-auto size-1.5 rounded-full bg-primary" />
              ) : null}
            </Link>
          );
        })}
      </nav>

      <nav
        aria-label="Mobile workspace navigation"
        className="flex max-w-full gap-1 overflow-x-auto border-b border-border bg-sidebar/90 p-2 lg:hidden"
      >
        {items.map((item) => {
          const href = item.segment ? getWorkspaceItemHref(base, item) : base;
          const active = isActiveItem(pathname, base, item);

          return (
            <Link
              key={item.segment || "home"}
              href={href as Route}
              aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-ring ${
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-card hover:text-foreground"
              }`}
            >
              <Icon name={item.icon} className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
