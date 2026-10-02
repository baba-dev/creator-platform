"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icon";

const items: { label: string; segment: string; icon: IconName }[] = [
  { label: "Home", segment: "", icon: "dashboard" },
  { label: "Image", segment: "image", icon: "image" },
  { label: "Video", segment: "video", icon: "video" },
  { label: "Spokesperson", segment: "spokesperson", icon: "sparkles" },
  { label: "Speech", segment: "speech", icon: "voice" },
  { label: "Chat", segment: "chat", icon: "chat" },
  { label: "Director", segment: "director", icon: "director" },
  { label: "Scripts", segment: "scripts", icon: "script" },
  { label: "Brand & Story", segment: "brand-assistants", icon: "brand" },
  { label: "Templates", segment: "templates", icon: "wand" },
  { label: "Projects", segment: "projects", icon: "projects" },
  { label: "History", segment: "history", icon: "activity" },
  { label: "Assets", segment: "assets", icon: "assets" },
  { label: "Team", segment: "members", icon: "admin" },
];

export function WorkspaceNavigation({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/app/${encodeURIComponent(slug)}`;
  return (
    <>
      <nav
        aria-label="Workspace navigation"
        className="hidden space-y-1 p-3 lg:block"
      >
        {items.map(({ label, segment, icon }) => {
          const href = segment ? `${base}/${segment}` : base;
          const active =
            pathname === href || (segment && pathname.startsWith(`${href}/`));
          return (
            <Link
              key={label}
              href={href as Route}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-ring ${active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-card hover:text-foreground"}`}
            >
              <Icon name={icon} className="size-[18px]" />
              {label}
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
        {items.map(({ label, segment, icon }) => {
          const href = segment ? `${base}/${segment}` : base;
          const active =
            pathname === href || (segment && pathname.startsWith(`${href}/`));
          return (
            <Link
              key={label}
              href={href as Route}
              aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-ring ${active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-card hover:text-foreground"}`}
            >
              <Icon name={icon} className="size-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
