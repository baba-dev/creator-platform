"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import {
  WORKSPACE_TOOL_CATEGORIES,
  getWorkspaceBase,
  getWorkspaceItemHref,
  isWorkspaceCategoryActive,
} from "@/lib/workspace-tools";

const mediaToolsItem = WORKSPACE_TOOL_CATEGORIES.flatMap(
  (category) => category.items,
).find((item) => item.id === "mediakit");

export function PrimaryMenu({ slug }: { slug: string }) {
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const base = getWorkspaceBase(slug);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpenCategory(null);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenCategory(null);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const [previousPathname, setPreviousPathname] = useState(pathname);
  if (previousPathname !== pathname) {
    setPreviousPathname(pathname);
    setOpenCategory(null);
  }

  return (
    <div
      ref={containerRef}
      className="relative flex items-center gap-1.5"
      role="navigation"
      aria-label="Primary Creation Menu"
    >
      <Link
        href={`${base}#create` as Route}
        className="group relative inline-flex h-9 items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3.5 text-xs font-bold text-primary shadow-xs transition hover:border-primary/60 hover:bg-primary/15 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span className="grid size-4 place-items-center rounded-full bg-primary/20 text-primary transition group-hover:scale-110">
          <Icon name="plus" className="size-3" />
        </span>
        <span className="tracking-wide">Quick Create</span>
      </Link>

      <div className="mx-1 h-4 w-px bg-border/60" aria-hidden="true" />

      {WORKSPACE_TOOL_CATEGORIES.map((category) => {
        const isOpen = openCategory === category.key;
        const isCurrentCategory = isWorkspaceCategoryActive(
          pathname,
          base,
          category,
        );

        return (
          <div key={category.key} className="relative">
            <button
              type="button"
              onClick={() => setOpenCategory(isOpen ? null : category.key)}
              aria-expanded={isOpen}
              aria-haspopup="true"
              className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-ring ${
                isOpen || isCurrentCategory
                  ? "bg-card text-foreground shadow-xs ring-1 ring-border"
                  : "text-muted-foreground hover:bg-card/70 hover:text-foreground"
              }`}
            >
              <Icon name={category.icon} className="size-3.5" />
              <span>{category.label}</span>
              {isCurrentCategory ? (
                <span
                  className="size-1.5 rounded-full bg-primary"
                  aria-hidden="true"
                />
              ) : null}
              <Icon
                name="chevron"
                className={`size-3 transition-transform duration-200 ${
                  isOpen ? "rotate-90" : ""
                }`}
              />
            </button>

            {isOpen ? (
              <div
                className="absolute left-0 top-full z-50 mt-2 w-72 rounded-2xl border border-border bg-card/95 p-2 shadow-lg backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
                role="menu"
                aria-orientation="vertical"
              >
                <div className="mb-1.5 flex items-center justify-between px-2.5 pt-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  <span>{category.label} Tools</span>
                  <span className="text-[10px] text-primary">
                    {category.items.length} apps
                  </span>
                </div>
                <div className="space-y-1">
                  {category.items.map((item) => (
                    <Link
                      key={item.id}
                      href={getWorkspaceItemHref(base, item) as Route}
                      role="menuitem"
                      onClick={() => setOpenCategory(null)}
                      className="group flex items-start gap-3 rounded-xl p-2 text-left transition hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border border-border/80 bg-background text-muted-foreground transition group-hover:border-primary/40 group-hover:bg-primary/10 group-hover:text-primary">
                        <Icon name={item.icon} className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-xs font-semibold text-foreground group-hover:text-primary">
                            {item.title}
                          </span>
                          {item.badge ? (
                            <span className="rounded-md border border-primary/30 bg-primary/10 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary">
                              {item.badge}
                            </span>
                          ) : null}
                        </div>
                        <p className="line-clamp-1 text-[11px] text-muted-foreground">
                          {item.description}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}

      {mediaToolsItem ? (
        <>
          <div className="mx-1 h-4 w-px bg-border/60" aria-hidden="true" />
          <Link
            href={getWorkspaceItemHref(base, mediaToolsItem) as Route}
            title={mediaToolsItem.title}
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-ring ${
              pathname === getWorkspaceItemHref(base, mediaToolsItem)
                ? "bg-card text-foreground shadow-xs ring-1 ring-border"
                : "text-muted-foreground hover:bg-card/70 hover:text-foreground"
            }`}
          >
            <Icon name={mediaToolsItem.icon} className="size-3.5" />
            <span className="hidden xl:inline">{mediaToolsItem.shortTitle}</span>
          </Link>
        </>
      ) : null}
    </div>
  );
}
