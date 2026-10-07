"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Icon, type IconName } from "@/components/ui/icon";
import {
  WORKSPACE_SECONDARY_ITEMS,
  WORKSPACE_TOOLS,
  getWorkspaceBase,
  getWorkspaceItemHref,
} from "@/lib/workspace-tools";

interface PaletteItem {
  id: string;
  category:
    "Studios & Tools" | "Conversations" | "Projects" | "Settings & Library";
  title: string;
  description?: string;
  icon: IconName;
  href?: string;
  action?: () => void;
  keywords?: readonly string[];
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  slug: string;
  threads?: Array<{ id: string; title: string; threadType?: string }>;
  projects?: Array<{ id: string; name: string }>;
}

const paletteSecondaryIds = new Set([
  "assets",
  "connections",
  "team",
  "history",
]);

export function CommandPalette({
  isOpen,
  onClose,
  slug,
  threads = [],
  projects = [],
}: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const base = getWorkspaceBase(slug);

  const toolItems: PaletteItem[] = WORKSPACE_TOOLS.map((item) => ({
    id: `tool-${item.id}`,
    category: "Studios & Tools",
    title: item.title,
    description: item.description,
    icon: item.icon,
    href: getWorkspaceItemHref(base, item),
    keywords: item.keywords,
  }));

  const secondaryItems: PaletteItem[] = WORKSPACE_SECONDARY_ITEMS.filter(
    (item) => paletteSecondaryIds.has(item.id),
  ).map((item) => ({
    id: `nav-${item.id}`,
    category: "Settings & Library",
    title: item.title,
    description: item.description,
    icon: item.icon,
    href: getWorkspaceItemHref(base, item),
  }));

  const defaultItems: PaletteItem[] = [
    ...toolItems,
    {
      id: "nav-quick-create",
      category: "Settings & Library",
      title: "Quick Create",
      description: "Start a new creation from the workspace home",
      icon: "plus",
      href: `${base}#create`,
      keywords: ["new creation", "new chat", "create"],
    },
    ...secondaryItems,
  ];

  const threadItems: PaletteItem[] = threads.map((thread) => ({
    id: `thread-${thread.id}`,
    category: "Conversations",
    title: thread.title,
    description:
      thread.threadType === "CREATIVE"
        ? "Creative conversation"
        : "Character Chat thread",
    icon: thread.threadType === "CREATIVE" ? "sparkles" : "chat",
    href:
      thread.threadType === "CREATIVE"
        ? `${base}/conversations/${encodeURIComponent(thread.id)}`
        : `${base}/chat?threadId=${encodeURIComponent(thread.id)}`,
    keywords: ["conversation", "chat"],
  }));

  const projectItems: PaletteItem[] = projects.map((project) => ({
    id: `project-${project.id}`,
    category: "Projects",
    title: project.name,
    description: "Open workspace project",
    icon: "projects",
    href: `${base}/projects/${project.id}`,
  }));

  const allItems = [...defaultItems, ...threadItems, ...projectItems];
  const normalizedQuery = query.trim().toLowerCase();

  const filteredItems = normalizedQuery
    ? allItems.filter((item) => {
        const searchable = [
          item.title,
          item.description,
          ...(item.keywords ?? []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return searchable.includes(normalizedQuery);
      })
    : allItems.slice(0, 12);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const executeItem = useCallback(
    (item: PaletteItem) => {
      onClose();
      if (item.action) {
        item.action();
      } else if (item.href) {
        router.push(item.href as Route);
      }
    },
    [onClose, router],
  );

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((previous) =>
          previous < filteredItems.length - 1 ? previous + 1 : 0,
        );
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((previous) =>
          previous > 0 ? previous - 1 : filteredItems.length - 1,
        );
      } else if (event.key === "Enter") {
        event.preventDefault();
        const selected = filteredItems[selectedIndex];
        if (selected) {
          executeItem(selected);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, selectedIndex, filteredItems, onClose, executeItem]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 sm:pt-24"
    >
      <div
        onClick={onClose}
        className="fixed inset-0 bg-background/80 backdrop-blur-md transition-opacity animate-in fade-in"
      />

      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Icon name="search" className="size-5 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Type a tool, chat, project, or setting..."
            className="flex-1 bg-transparent text-sm font-medium text-foreground outline-hidden placeholder:text-muted-foreground"
          />
          <kbd className="hidden sm:inline-block rounded-md border border-border bg-surface-sunken px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
            ESC
          </kbd>
        </div>

        <div className="max-h-96 overflow-y-auto p-2 scrollbar-thin">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              No results found for &ldquo;{query}&rdquo;.
            </div>
          ) : (
            <div className="space-y-1">
              {filteredItems.map((item, index) => {
                const isSelected = selectedIndex === index;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => executeItem(item)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                      isSelected
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-surface-sunken"
                    }`}
                  >
                    <span
                      className={`grid size-7 shrink-0 place-items-center rounded-lg border text-muted-foreground transition ${
                        isSelected
                          ? "border-primary/40 bg-primary/20 text-primary"
                          : "border-border bg-background"
                      }`}
                    >
                      <Icon name={item.icon} className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold">
                        {item.title}
                      </div>
                      {item.description ? (
                        <div className="truncate text-[11px] text-muted-foreground">
                          {item.description}
                        </div>
                      ) : null}
                    </div>
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                      {item.category}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border bg-surface-sunken/60 px-4 py-2 text-[11px] text-muted-foreground">
          <span>Navigate with arrows, Enter to open</span>
          <span className="font-mono">Aiwa Creators</span>
        </div>
      </div>
    </div>
  );
}
