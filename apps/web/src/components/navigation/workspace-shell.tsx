"use client";

import { useState, type ReactNode } from "react";

interface WorkspaceShellProps {
  sidebar: (collapsed: boolean, toggleCollapse: () => void) => ReactNode;
  header: ReactNode;
  mobileHeader: ReactNode;
  activityCenter: ReactNode;
  assistantWidget: ReactNode;
  children: ReactNode;
}

export function WorkspaceShell({
  sidebar,
  header,
  mobileHeader,
  activityCenter,
  assistantWidget,
  children,
}: WorkspaceShellProps) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("aiwa_sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });

  function toggleCollapse() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("aiwa_sidebar_collapsed", String(next));
      } catch {
        // Ignore localStorage errors
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
      {/* Desktop Sidebar Area */}
      <aside
        className={`hidden border-r border-border bg-sidebar/95 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col overflow-hidden transition-all duration-200 ${
          collapsed ? "lg:w-[68px]" : "lg:w-[260px]"
        }`}
      >
        {sidebar(collapsed, toggleCollapse)}
      </aside>

      {/* Main Content Area */}
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
