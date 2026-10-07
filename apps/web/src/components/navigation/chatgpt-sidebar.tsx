"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Brand } from "@/components/ui/brand";
import { Icon } from "@/components/ui/icon";
import { authClient } from "@/lib/auth-client";
import {
  WORKSPACE_SECONDARY_ITEMS,
  WORKSPACE_TOOL_CATEGORIES,
  getWorkspaceBase,
  getWorkspaceItemHref,
  isWorkspaceItemActive,
} from "@/lib/workspace-tools";
import { CommandPalette } from "./command-palette";

const assetItem = WORKSPACE_SECONDARY_ITEMS.find(
  (item) => item.id === "assets",
)!;
const connectionsItem = WORKSPACE_SECONDARY_ITEMS.find(
  (item) => item.id === "connections",
)!;
const historyItem = WORKSPACE_SECONDARY_ITEMS.find(
  (item) => item.id === "history",
)!;

interface ProjectItem {
  id: string;
  name: string;
}

interface ThreadItem {
  id: string;
  title: string;
  updatedAt: string;
  threadType?: string;
}

function getThreadRoute(base: string, thread: ThreadItem): Route {
  if (thread.threadType === "CREATIVE") {
    return `${base}/conversations/${encodeURIComponent(thread.id)}` as Route;
  }
  return `${base}/chat?threadId=${encodeURIComponent(thread.id)}` as Route;
}

function isThreadActive(
  pathname: string,
  currentThreadId: string | null,
  thread: ThreadItem,
  base: string,
): boolean {
  if (thread.threadType === "CREATIVE") {
    return pathname === `${base}/conversations/${thread.id}`;
  }
  return pathname === `${base}/chat` && currentThreadId === thread.id;
}

interface FavoriteAssetItem {
  id: string;
  title?: string | null;
  mimeType: string;
}

interface ChatGPTAppSidebarProps {
  slug: string;
  user: {
    id: string;
    name: string;
    email: string;
    image?: string | null;
  };
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  credits: bigint | number;
  initialProjects?: ProjectItem[];
  initialThreads?: ThreadItem[];
  initialFavoriteAssets?: FavoriteAssetItem[];
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onItemClick?: () => void;
  showToolNavigation?: boolean;
}

export function ChatGPTAppSidebar({
  slug,
  user,
  organization,
  credits,
  initialProjects = [],
  initialThreads = [],
  initialFavoriteAssets = [],
  isCollapsed = false,
  onToggleCollapse,
  onItemClick,
  showToolNavigation = false,
}: ChatGPTAppSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const base = getWorkspaceBase(slug);

  const currentThreadId = searchParams.get("threadId");

  // Accordion open/close states
  const [pinnedOpen, setPinnedOpen] = useState(true);
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [toolsOpen, setToolsOpen] = useState(true);

  // Command palette state
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Pinned threads stored in localStorage
  const [pinnedThreadIds, setPinnedThreadIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = window.localStorage.getItem(
        `aiwa_pinned_threads_${organization.id}`,
      );
      return stored ? (JSON.parse(stored) as string[]) : [];
    } catch {
      return [];
    }
  });

  const [createdThreads, setCreatedThreads] = useState<ThreadItem[]>([]);
  const [deletedThreadIds, setDeletedThreadIds] = useState<string[]>([]);
  const [renamedThreads, setRenamedThreads] = useState<Record<string, string>>(
    {},
  );
  const [activeMenuThreadId, setActiveMenuThreadId] = useState<string | null>(
    null,
  );

  // Listen for client events from Quick Create and Conversation Workspace
  useEffect(() => {
    function handleConversationStarted(e: Event) {
      const customEvent = e as CustomEvent<ThreadItem>;
      if (customEvent.detail && customEvent.detail.id) {
        setCreatedThreads((prev) => {
          if (prev.some((t) => t.id === customEvent.detail.id)) return prev;
          return [customEvent.detail, ...prev];
        });
      }
    }

    function handleTitleUpdated(e: Event) {
      const customEvent = e as CustomEvent<{
        id?: string;
        conversationId?: string;
        title: string;
      }>;
      const targetId =
        customEvent.detail?.id ?? customEvent.detail?.conversationId;
      if (targetId && customEvent.detail?.title) {
        setRenamedThreads((prev) => ({
          ...prev,
          [targetId]: customEvent.detail.title,
        }));
      }
    }

    window.addEventListener(
      "aiwa:conversation-started",
      handleConversationStarted,
    );
    window.addEventListener(
      "aiwa:conversation-title-updated",
      handleTitleUpdated,
    );
    return () => {
      window.removeEventListener(
        "aiwa:conversation-started",
        handleConversationStarted,
      );
      window.removeEventListener(
        "aiwa:conversation-title-updated",
        handleTitleUpdated,
      );
    };
  }, []);

  // Inline renaming state
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const threads = [
    ...createdThreads.filter(
      (ct) => !initialThreads.some((it) => it.id === ct.id),
    ),
    ...initialThreads,
  ]
    .filter((t) => !deletedThreadIds.includes(t.id))
    .map((t) => ({
      ...t,
      title: renamedThreads[t.id] ?? t.title,
    }));

  // Keyboard shortcut listener for Cmd+K / Ctrl+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function togglePinThread(threadId: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setPinnedThreadIds((prev) => {
      const next = prev.includes(threadId)
        ? prev.filter((id) => id !== threadId)
        : [...prev, threadId];
      try {
        localStorage.setItem(
          `aiwa_pinned_threads_${organization.id}`,
          JSON.stringify(next),
        );
      } catch {
        // Ignore
      }
      return next;
    });
    setActiveMenuThreadId(null);
  }

  async function handleDeleteThread(thread: ThreadItem, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      const endpoint =
        thread.threadType === "CREATIVE"
          ? `/api/conversations/${encodeURIComponent(thread.id)}`
          : `/api/chat/threads/${encodeURIComponent(thread.id)}`;
      await fetch(endpoint, {
        method: "DELETE",
      });
      setDeletedThreadIds((prev) => [...prev, thread.id]);
      setPinnedThreadIds((prev) => prev.filter((id) => id !== thread.id));
      if (isThreadActive(pathname, currentThreadId, thread, base)) {
        router.push(base as Route);
      }
    } catch {
      // Ignore
    }
    setActiveMenuThreadId(null);
  }

  function startRenaming(thread: ThreadItem, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setEditingThreadId(thread.id);
    setEditTitle(thread.title);
    setActiveMenuThreadId(null);
  }

  async function commitRename(thread: ThreadItem) {
    const trimmed = editTitle.trim();
    if (!trimmed) {
      setEditingThreadId(null);
      return;
    }

    try {
      const endpoint =
        thread.threadType === "CREATIVE"
          ? `/api/conversations/${encodeURIComponent(thread.id)}`
          : `/api/chat/threads/${encodeURIComponent(thread.id)}`;
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      if (res.ok) {
        setRenamedThreads((prev) => ({ ...prev, [thread.id]: trimmed }));
      }
    } catch {
      // Ignore
    }
    setEditingThreadId(null);
  }

  // Get user initials (e.g. "Baba Bhayanak" -> "BB")
  const initials =
    user.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U";

  const pinnedThreads = threads.filter((t) => pinnedThreadIds.includes(t.id));
  const recentThreads = threads.filter((t) => !pinnedThreadIds.includes(t.id));

  // ==========================================
  // Render: Mini-Rail Mode (Collapsed = true)
  // ==========================================
  if (isCollapsed) {
    return (
      <>
        <div
          className="flex h-full w-full flex-col items-center bg-sidebar/95 py-3 text-foreground select-none"
          aria-label="Mini-Rail Sidebar"
        >
          {/* Expand Toggle */}
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Expand Sidebar"
            className="grid size-9 place-items-center rounded-xl border border-border/70 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground transition"
          >
            <Icon name="sidebar" className="size-4" />
          </button>

          <div className="my-2 h-px w-8 bg-border/60" aria-hidden="true" />

          {/* Quick Actions in Mini-Rail */}
          <div className="flex flex-col items-center gap-2">
            <Link
              href={`${base}#create` as Route}
              onClick={onItemClick}
              title="Quick Create"
              className={`grid size-9 place-items-center rounded-xl transition ${
                pathname === base
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "border border-border/80 bg-card text-muted-foreground hover:border-primary/40 hover:text-primary"
              }`}
            >
              <Icon name="plus" className="size-4" />
            </Link>

            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              title="Search & Command Palette (Cmd+K)"
              className="grid size-9 place-items-center rounded-xl border border-border/80 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground transition"
            >
              <Icon name="search" className="size-4" />
            </button>

            <Link
              href={getWorkspaceItemHref(base, assetItem) as Route}
              onClick={onItemClick}
              title={assetItem.title}
              className={`grid size-9 place-items-center rounded-xl transition ${
                pathname.startsWith(getWorkspaceItemHref(base, assetItem))
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-card hover:text-foreground"
              }`}
            >
              <Icon name={assetItem.icon} className="size-4" />
            </Link>

            <Link
              href={getWorkspaceItemHref(base, connectionsItem) as Route}
              onClick={onItemClick}
              title={connectionsItem.title}
              className={`grid size-9 place-items-center rounded-xl transition ${
                pathname.startsWith(getWorkspaceItemHref(base, connectionsItem))
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-card hover:text-foreground"
              }`}
            >
              <Icon name={connectionsItem.icon} className="size-4" />
            </Link>

            <Link
              href={getWorkspaceItemHref(base, historyItem) as Route}
              onClick={onItemClick}
              title={historyItem.title}
              className={`grid size-9 place-items-center rounded-xl transition ${
                pathname.startsWith(getWorkspaceItemHref(base, historyItem))
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-card hover:text-foreground"
              }`}
            >
              <Icon name={historyItem.icon} className="size-4" />
            </Link>
          </div>

          {/* User Avatar Pill in Mini-Rail */}
          <div className="mt-auto pt-2">
            <span
              title={`${user.name} • ${credits.toLocaleString("en-US")} credits`}
              className="grid size-9 place-items-center rounded-xl bg-primary/20 font-mono text-xs font-bold text-primary shadow-2xs cursor-pointer"
            >
              {initials}
            </span>
          </div>
        </div>

        <CommandPalette
          isOpen={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          slug={slug}
          threads={threads}
          projects={initialProjects}
        />
      </>
    );
  }

  // ==========================================
  // Render: Full Mode (Collapsed = false)
  // ==========================================
  return (
    <>
      <div
        className="flex h-full w-full flex-col bg-sidebar/95 text-foreground select-none"
        aria-label="ChatGPT Creative Sidebar"
      >
        {/* Top Header: Brand, Organization & Collapse Toggle */}
        <div className="flex h-14 items-center justify-between px-3.5 border-b border-border/60">
          <div className="flex items-center gap-2">
            <Brand href={base} compact />
            <span className="truncate text-xs font-semibold text-muted-foreground max-w-[110px]">
              {organization.name}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              title="Command Palette (Cmd+K)"
              className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-card hover:text-foreground transition"
            >
              <Icon name="search" className="size-4" />
            </button>

            {onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                title="Collapse Sidebar"
                className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-card hover:text-foreground transition"
              >
                <Icon name="sidebar" className="size-4" />
              </button>
            )}
          </div>
        </div>

        {/* Primary Action */}
        <div className="p-2.5">
          <Link
            href={`${base}#create` as Route}
            onClick={onItemClick}
            className={`flex h-10 w-full items-center gap-3 rounded-xl px-3 text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-ring ${
              pathname === base
                ? "bg-primary text-primary-foreground shadow-xs"
                : "border border-border/80 bg-card/80 text-foreground hover:border-primary/40 hover:bg-primary/10 hover:text-primary shadow-2xs"
            }`}
          >
            <Icon name="plus" className="size-4" />
            <span>Quick Create</span>
          </Link>
        </div>

        {/* Top Quicklinks: Asset Library & Connections */}
        <div className="space-y-0.5 px-2.5 pb-2 border-b border-border/60">
          <Link
            href={getWorkspaceItemHref(base, assetItem) as Route}
            onClick={onItemClick}
            className={`flex h-9 items-center gap-3 rounded-xl px-3 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-ring ${
              pathname.startsWith(getWorkspaceItemHref(base, assetItem))
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-card hover:text-foreground"
            }`}
          >
            <Icon name={assetItem.icon} className="size-4" />
            <span>{assetItem.title}</span>
          </Link>

          <Link
            href={getWorkspaceItemHref(base, connectionsItem) as Route}
            onClick={onItemClick}
            className={`flex h-9 items-center gap-3 rounded-xl px-3 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-ring ${
              pathname.startsWith(getWorkspaceItemHref(base, connectionsItem))
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-card hover:text-foreground"
            }`}
          >
            <Icon name={connectionsItem.icon} className="size-4" />
            <span>{connectionsItem.title}</span>
          </Link>

          <Link
            href={getWorkspaceItemHref(base, historyItem) as Route}
            onClick={onItemClick}
            className={`flex h-9 items-center gap-3 rounded-xl px-3 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-ring ${
              pathname.startsWith(getWorkspaceItemHref(base, historyItem))
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-card hover:text-foreground"
            }`}
          >
            <Icon name={historyItem.icon} className="size-4" />
            <span>{historyItem.title}</span>
          </Link>
        </div>

        {/* Scrollable Center: Tools (mobile), Pinned, Projects, Recents */}
        <div className="flex-1 space-y-4 overflow-y-auto px-2 py-3 scrollbar-thin">
          {showToolNavigation ? (
            <div>
              <button
                type="button"
                onClick={() => setToolsOpen(!toolsOpen)}
                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-muted-foreground transition hover:text-foreground"
              >
                <div className="flex items-center gap-1.5">
                  <Icon name="wand" className="size-3.5 text-primary" />
                  <span>Tools</span>
                </div>
                <Icon
                  name="chevron"
                  className={`size-3 transition-transform duration-200 ${
                    toolsOpen ? "rotate-90" : ""
                  }`}
                />
              </button>

              {toolsOpen ? (
                <div className="mt-1 space-y-3 pl-1.5">
                  {WORKSPACE_TOOL_CATEGORIES.map((category) => (
                    <div key={category.key}>
                      <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
                        {category.label}
                      </div>
                      <div className="space-y-0.5">
                        {category.items.map((item) => {
                          const href = getWorkspaceItemHref(base, item);
                          const active = isWorkspaceItemActive(
                            pathname,
                            base,
                            item,
                          );
                          return (
                            <Link
                              key={item.id}
                              href={href as Route}
                              onClick={onItemClick}
                              className={`flex h-8 items-center gap-2 rounded-xl px-2.5 text-xs transition ${
                                active
                                  ? "bg-card font-semibold text-primary shadow-xs ring-1 ring-border"
                                  : "text-foreground/80 hover:bg-card hover:text-foreground"
                              }`}
                            >
                              <Icon
                                name={item.icon}
                                className="size-3.5 shrink-0"
                              />
                              <span className="truncate">{item.title}</span>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Section: Pinned Dropdown */}
          <div>
            <button
              type="button"
              onClick={() => setPinnedOpen(!pinnedOpen)}
              className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-muted-foreground transition hover:text-foreground"
            >
              <div className="flex items-center gap-1.5">
                <Icon name="pin" className="size-3.5 text-primary" />
                <span>Pinned</span>
              </div>
              <Icon
                name="chevron"
                className={`size-3 transition-transform duration-200 ${
                  pinnedOpen ? "rotate-90" : ""
                }`}
              />
            </button>

            {pinnedOpen && (
              <div className="mt-1 space-y-0.5 pl-1.5">
                {pinnedThreads.length === 0 &&
                initialFavoriteAssets.length === 0 ? (
                  <div className="px-2 py-2 text-[11px] text-muted-foreground/70">
                    No pinned chats or creations yet.
                  </div>
                ) : (
                  <>
                    {/* Pinned Conversation Threads */}
                    {pinnedThreads.map((thread) => {
                      const isActive = isThreadActive(
                        pathname,
                        currentThreadId,
                        thread,
                        base,
                      );
                      return (
                        <div key={thread.id} className="group relative">
                          <Link
                            href={getThreadRoute(base, thread)}
                            onClick={onItemClick}
                            className={`flex h-8 items-center gap-2 rounded-xl px-2.5 text-xs transition ${
                              isActive
                                ? "bg-card font-semibold text-primary shadow-xs ring-1 ring-border"
                                : "text-foreground/80 hover:bg-card hover:text-foreground"
                            }`}
                          >
                            <Icon
                              name={
                                thread.threadType === "CREATIVE"
                                  ? "sparkles"
                                  : "chat"
                              }
                              className="size-3 shrink-0 text-primary"
                            />
                            <span className="truncate flex-1">
                              {thread.title}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => togglePinThread(thread.id, e)}
                              title="Unpin"
                              className="hidden group-hover:inline-flex p-0.5 text-muted-foreground hover:text-destructive"
                            >
                              <Icon name="pin" className="size-3" />
                            </button>
                          </Link>
                        </div>
                      );
                    })}

                    {/* Favorite Creations / Assets */}
                    {initialFavoriteAssets.map((asset) => (
                      <Link
                        key={asset.id}
                        href={
                          `${base}/assets?assetId=${encodeURIComponent(asset.id)}` as Route
                        }
                        onClick={onItemClick}
                        className="flex h-8 items-center gap-2 rounded-xl px-2.5 text-xs text-foreground/80 hover:bg-card hover:text-foreground transition"
                      >
                        <Icon
                          name="sparkles"
                          className="size-3 shrink-0 text-accent"
                        />
                        <span className="truncate flex-1">
                          {asset.title || "Favorited Creation"}
                        </span>
                      </Link>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Section: Projects Dropdown */}
          <div>
            <button
              type="button"
              onClick={() => setProjectsOpen(!projectsOpen)}
              className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-muted-foreground transition hover:text-foreground"
            >
              <div className="flex items-center gap-1.5">
                <Icon name="projects" className="size-3.5" />
                <span>Projects</span>
              </div>
              <Icon
                name="chevron"
                className={`size-3 transition-transform duration-200 ${
                  projectsOpen ? "rotate-90" : ""
                }`}
              />
            </button>

            {projectsOpen && (
              <div className="mt-1 space-y-0.5 pl-1.5">
                {initialProjects.length === 0 ? (
                  <div className="px-2 py-2 text-[11px] text-muted-foreground/70">
                    No organization projects yet.
                  </div>
                ) : (
                  initialProjects.map((project) => {
                    const isActive = pathname.startsWith(
                      `${base}/projects/${project.id}`,
                    );
                    return (
                      <Link
                        key={project.id}
                        href={`${base}/projects/${project.id}` as Route}
                        onClick={onItemClick}
                        className={`flex h-8 items-center gap-2 rounded-xl px-2.5 text-xs transition ${
                          isActive
                            ? "bg-card font-semibold text-primary shadow-xs ring-1 ring-border"
                            : "text-foreground/80 hover:bg-card hover:text-foreground"
                        }`}
                      >
                        <Icon
                          name="projects"
                          className="size-3 shrink-0 text-muted-foreground"
                        />
                        <span className="truncate flex-1">{project.name}</span>
                      </Link>
                    );
                  })
                )}
                <Link
                  href={`${base}/projects` as Route}
                  onClick={onItemClick}
                  className="flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold text-primary hover:underline"
                >
                  <Icon name="plus" className="size-3" />
                  <span>Manage all projects</span>
                </Link>
              </div>
            )}
          </div>

          {/* Section: Recents List (Conversations) */}
          <div>
            <div className="px-2 py-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Recents
            </div>

            <div className="mt-1 space-y-0.5">
              {recentThreads.length === 0 ? (
                <div className="px-2 py-2 text-[11px] text-muted-foreground/70">
                  No recent conversations.
                </div>
              ) : (
                recentThreads.map((thread) => {
                  const isActive = isThreadActive(
                    pathname,
                    currentThreadId,
                    thread,
                    base,
                  );
                  const isMenuOpen = activeMenuThreadId === thread.id;
                  const isEditing = editingThreadId === thread.id;

                  return (
                    <div key={thread.id} className="group relative">
                      {isEditing ? (
                        <div className="flex h-9 items-center rounded-xl border border-primary bg-card px-2.5 shadow-xs">
                          <input
                            type="text"
                            value={editTitle}
                            autoFocus
                            onChange={(e) => setEditTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitRename(thread);
                              if (e.key === "Escape") setEditingThreadId(null);
                            }}
                            onBlur={() => commitRename(thread)}
                            className="w-full bg-transparent text-xs font-medium text-foreground outline-hidden"
                          />
                        </div>
                      ) : (
                        <Link
                          href={getThreadRoute(base, thread)}
                          onClick={onItemClick}
                          className={`flex h-9 items-center justify-between rounded-xl px-3 text-xs transition ${
                            isActive
                              ? "bg-card font-semibold text-primary shadow-xs ring-1 ring-border"
                              : "text-foreground/85 hover:bg-card hover:text-foreground"
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate flex-1 pr-2">
                            {thread.threadType === "CREATIVE" ? (
                              <Icon
                                name="sparkles"
                                className="size-3 shrink-0 text-primary/70"
                              />
                            ) : null}
                            <span className="truncate">{thread.title}</span>
                          </div>

                          {/* Thread action button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setActiveMenuThreadId(
                                isMenuOpen ? null : thread.id,
                              );
                            }}
                            title="Options"
                            className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-foreground transition rounded-md"
                          >
                            <Icon name="ellipsis" className="size-3.5" />
                          </button>
                        </Link>
                      )}

                      {/* Thread Menu Popover */}
                      {isMenuOpen && (
                        <div
                          className="absolute right-2 top-full z-50 mt-1 w-36 rounded-xl border border-border bg-card p-1 shadow-lg"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={(e) => startRenaming(thread, e)}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11px] font-medium text-foreground hover:bg-surface-sunken"
                          >
                            <Icon
                              name="edit"
                              className="size-3 text-muted-foreground"
                            />
                            <span>Rename</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => togglePinThread(thread.id, e)}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11px] font-medium text-foreground hover:bg-surface-sunken"
                          >
                            <Icon name="pin" className="size-3 text-primary" />
                            <span>Pin to top</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteThread(thread, e)}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11px] font-medium text-destructive hover:bg-destructive/10"
                          >
                            <Icon name="trash" className="size-3" />
                            <span>Delete</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Bottom Profile Pill (ChatGPT Style) */}
        <div className="p-2.5 border-t border-border/80 bg-sidebar/95">
          <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/70 p-2 shadow-2xs hover:border-primary/40 transition">
            {/* Avatar with User Initials (ChatGPT Style) */}
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/20 font-mono text-xs font-bold text-primary">
              {initials}
            </span>

            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-bold text-foreground">
                {user.name}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="font-semibold text-primary">
                  {credits.toLocaleString("en-US")}
                </span>
                <span>credits</span>
              </div>
            </div>

            <button
              type="button"
              onClick={async () => {
                await authClient.signOut();
                router.push("/sign-in");
              }}
              title="Sign Out"
              className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition"
            >
              <Icon name="logout" className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Global Command Palette */}
      <CommandPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        slug={slug}
        threads={threads}
        projects={initialProjects}
      />
    </>
  );
}
