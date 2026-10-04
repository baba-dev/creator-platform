"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChatGPTAppSidebar } from "@/components/navigation/chatgpt-sidebar";

interface WorkspaceSidebarProps {
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
  initialProjects?: Array<{ id: string; name: string }>;
  initialThreads?: Array<{ id: string; title: string; updatedAt: string }>;
  initialFavoriteAssets?: Array<{
    id: string;
    title?: string | null;
    mimeType: string;
  }>;
}

interface WorkspaceShellProps {
  sidebarProps: WorkspaceSidebarProps;
  header: ReactNode;
  mobileHeader: ReactNode;
  activityCenter: ReactNode;
  assistantWidget: ReactNode;
  children: ReactNode;
}

export function WorkspaceShell({
  sidebarProps,
  header,
  mobileHeader,
  activityCenter,
  assistantWidget,
  children,
}: WorkspaceShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(
        window.localStorage.getItem("aiwa_sidebar_collapsed") === "true",
      );
    } catch {
      // Ignore unavailable or blocked localStorage and keep the safe default.
    }
  }, []);

  function toggleCollapse() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(
          "aiwa_sidebar_collapsed",
          String(next),
        );
      } catch {
        // Ignore localStorage errors.
      }
      return next;
    });
  }

  return (
    <div
      className={`min-h-screen min-w-0 bg-background text-foreground transition-all duration-200 lg:grid ${
        collapsed
          ? "lg:grid-cols-[68px_minmax(0,1fr)]"
          : "lg:grid-cols-[260px_minmax(0,1fr)]"
      }`}
    >
      <aside
        className={`hidden overflow-hidden border-r border-border bg-sidebar/95 transition-all duration-200 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col ${
          collapsed ? "lg:w-[68px]" : "lg:w-[260px]"
        }`}
      >
        <ChatGPTAppSidebar
          {...sidebarProps}
          isCollapsed={collapsed}
          onToggleCollapse={toggleCollapse}
        />
      </aside>

      <div className="min-w-0 overflow-x-clip">
        {header}
        {mobileHeader}
        <div className="min-w-0">{children}</div>
        {activityCenter}
        {assistantWidget}
      </div>
    </div>
  );
}
