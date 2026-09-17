"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";

import { Icon, type IconName } from "@/components/ui/icon";

export type AdminNavigationItem = {
  href: string;
  label: string;
  icon: IconName;
  badge?: string;
};

export function AdminNavigation({
  items,
  mobile = false,
}: {
  items: readonly AdminNavigationItem[];
  mobile?: boolean;
}) {
  const pathname = usePathname();

  return (
    <nav
      className={
        mobile
          ? "sticky top-[72px] z-20 flex gap-1 overflow-x-auto border-b border-border bg-background/90 px-4 py-2 backdrop-blur-xl xl:hidden"
          : "mt-6 space-y-1"
      }
      aria-label={
        mobile
          ? "Mobile administration navigation"
          : "Administration navigation"
      }
    >
      {items.map((item) => {
        const active =
          item.href === "/admin"
            ? pathname === item.href
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href as Route}
            aria-current={active ? "page" : undefined}
            className={
              mobile
                ? `inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`
                : `flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${active ? "border-primary/20 bg-primary/10 text-primary shadow-xs" : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"}`
            }
          >
            <Icon name={item.icon} className="size-[18px]" />
            {item.label}
            {item.badge ? (
              <span className="ml-auto rounded-full bg-warning/15 px-2 py-0.5 font-mono text-[9px] font-bold text-warning">
                {item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
