"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Icon, type IconName } from "@/components/ui/icon";

interface PaletteItem {
  id: string;
  category:
    "Studios & Tools" | "Conversations" | "Projects" | "Settings & Library";
  title: string;
  description?: string;
  icon: IconName;
  href?: string;
  action?: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  slug: string;
  threads?: Array<{ id: string; title: string; threadType?: string }>;
  projects?: Array<{ id: string; name: string }>;
}

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
  const base = `/app/${encodeURIComponent(slug)}`;

  // Default actions and studio destinations
  const defaultItems: PaletteItem[] = [
    // Studios & Tools
    {
      id: "tool-image",
      category: "Studios & Tools",
      title: "Image Studio",
      description: "Text-to-image & Seedream generation",
      icon: "image",
      href: `${base}/image`,
    },
    {
      id: "tool-retouch",
      category: "Studios & Tools",
      title: "AI Retouch & Canvas",
      description: "Inpainting, outpainting, regional edits",
      icon: "wand",
      href: `${base}/image?tab=ai`,
    },
    {
      id: "tool-video",
      category: "Studios & Tools",
      title: "Video Studio",
      description: "Cinematic camera and text-to-video",
      icon: "video",
      href: `${base}/video`,
    },
    {
      id: "tool-spokesperson",
      category: "Studios & Tools",
      title: "AI Spokesperson Studio",
      description: "Talking presenter avatars",
      icon: "sparkles",
      href: `${base}/spokesperson`,
    },
    {
      id: "tool-speech",
      category: "Studios & Tools",
      title: "Voice & Speech Studio",
      description: "Neural voice narration & TTS",
      icon: "voice",
      href: `${base}/speech`,
    },
    {
      id: "tool-director",
      category: "Studios & Tools",
      title: "Creative Director",
      description: "Storyboard orchestration & direction",
      icon: "director",
      href: `${base}/director`,
    },
    {
      id: "tool-scripts",
      category: "Studios & Tools",
      title: "Scriptwriter",
      description: "Screenplay and dialogue synthesis",
      icon: "script",
      href: `${base}/scripts`,
    },
    {
      id: "tool-templates",
      category: "Studios & Tools",
      title: "Generation Templates",
      description: "Pre-engineered creative recipes",
      icon: "wand",
      href: `${base}/templates`,
    },
    {
      id: "tool-story",
      category: "Studios & Tools",
      title: "Story Planner",
      description: "Three-act beats and narrative arcs",
      icon: "story",
      href: `${base}/story-planning`,
    },

    // Settings & Library
    {
      id: "nav-new-chat",
      category: "Settings & Library",
      title: "New Chat",
      description: "Start a fresh creative conversation",
      icon: "edit",
      href: `${base}`,
    },
    {
      id: "nav-assets",
      category: "Settings & Library",
      title: "Asset Library",
      description: "Browse uploaded and generated media",
      icon: "assets",
      href: `${base}/assets`,
    },
    {
      id: "nav-connections",
      category: "Settings & Library",
      title: "Connections & Cloud Storage",
      description: "Configure Google Drive, OneDrive sync",
      icon: "settings",
      href: `${base}/storage`,
    },
    {
      id: "nav-team",
      category: "Settings & Library",
      title: "Team & Members",
      description: "Manage collaborator roles & spending caps",
      icon: "admin",
      href: `${base}/members`,
    },
    {
      id: "nav-history",
      category: "Settings & Library",
      title: "Generation History",
      description: "View recent jobs and execution logs",
      icon: "activity",
      href: `${base}/history`,
    },
  ];

  // Dynamic threads
  const threadItems: PaletteItem[] = threads.map((t) => ({
    id: `thread-${t.id}`,
    category: "Conversations",
    title: t.title,
    description:
      t.threadType === "CREATIVE"
        ? "Creative conversation"
        : "Open chat thread",
    icon: t.threadType === "CREATIVE" ? "sparkles" : "chat",
    href:
      t.threadType === "CREATIVE"
        ? `${base}/conversations/${encodeURIComponent(t.id)}`
        : `${base}/chat?threadId=${encodeURIComponent(t.id)}`,
  }));

  // Dynamic projects
  const projectItems: PaletteItem[] = projects.map((p) => ({
    id: `project-${p.id}`,
    category: "Projects",
    title: p.name,
    description: "Open workspace project",
    icon: "projects",
    href: `${base}/projects/${p.id}`,
  }));

  const allItems = [...defaultItems, ...threadItems, ...projectItems];

  const filteredItems = query.trim()
    ? allItems.filter(
        (item) =>
          item.title.toLowerCase().includes(query.toLowerCase()) ||
          item.description?.toLowerCase().includes(query.toLowerCase()),
      )
    : allItems.slice(0, 10);

  // Focus input on open
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

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < filteredItems.length - 1 ? prev + 1 : 0,
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredItems.length - 1,
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
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
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-background/80 backdrop-blur-md transition-opacity animate-in fade-in"
      />

      {/* Palette Card */}
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Icon name="search" className="size-5 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Type a tool, chat, project, or setting..."
            className="flex-1 bg-transparent text-sm font-medium text-foreground outline-hidden placeholder:text-muted-foreground"
          />
          <kbd className="hidden sm:inline-block rounded-md border border-border bg-surface-sunken px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
            ESC
          </kbd>
        </div>

        {/* Results List */}
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
                      {item.description && (
                        <div className="truncate text-[11px] text-muted-foreground">
                          {item.description}
                        </div>
                      )}
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

        {/* Bottom Helper Bar */}
        <div className="flex items-center justify-between border-t border-border bg-surface-sunken/60 px-4 py-2 text-[11px] text-muted-foreground">
          <span>Navigate with arrows, Enter to open</span>
          <span className="font-mono">Aiwa Creators</span>
        </div>
      </div>
    </div>
  );
}
