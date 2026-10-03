"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Brand } from "@/components/ui/brand";
import { Icon } from "@/components/ui/icon";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { ChatGPTAppSidebar } from "./chatgpt-sidebar";
import { UserHeaderMenu } from "./user-header-menu";

interface MobileHeaderProps {
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
  role: string;
  credits: bigint | number;
  initialProjects?: Array<{ id: string; name: string }>;
  initialThreads?: Array<{ id: string; title: string; updatedAt: string }>;
  initialFavoriteAssets?: Array<{
    id: string;
    title?: string | null;
    mimeType: string;
  }>;
}

export function MobileHeader({
  slug,
  user,
  organization,
  role,
  credits,
  initialProjects = [],
  initialThreads = [],
  initialFavoriteAssets = [],
}: MobileHeaderProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const base = `/app/${encodeURIComponent(slug)}`;

  // Prevent background scroll when drawer is open
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  return (
    <div className="sticky top-0 z-40 lg:hidden">
      {/* Top Mobile Bar */}
      <header className="flex min-h-[58px] items-center justify-between border-b border-border bg-background/95 px-3 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          {/* Hamburger Drawer Toggle */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open sidebar menu"
            className="grid size-9 place-items-center rounded-xl border border-border/80 bg-card text-foreground transition hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Icon name="menu" className="size-5" />
          </button>

          <Brand compact href={base} />
        </div>

        {/* Right side controls: Quick Create, User Menu, Theme Toggle */}
        <div className="flex items-center gap-1.5">
          <Link
            href={`${base}#create` as Route}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-2.5 text-xs font-bold text-primary"
          >
            <Icon name="plus" className="size-3" />
            <span className="hidden sm:inline">Create</span>
          </Link>

          <UserHeaderMenu
            slug={slug}
            user={user}
            organization={organization}
            role={role}
          />

          <ThemeToggle />
        </div>
      </header>

      {/* Mobile Drawer (Slide-over) */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop Scrim */}
          <div
            onClick={() => setDrawerOpen(false)}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
          />

          {/* Drawer Content */}
          <div className="relative flex w-[290px] max-w-[85vw] flex-col bg-sidebar shadow-2xl animate-in slide-in-from-left duration-200">
            {/* Close Button Header */}
            <div className="flex h-12 items-center justify-between px-3 border-b border-border/60">
              <span className="text-xs font-bold text-foreground">Menu</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-card hover:text-foreground"
              >
                ✕
              </button>
            </div>

            {/* Embedded ChatGPT Sidebar */}
            <div className="flex-1 overflow-hidden">
              <ChatGPTAppSidebar
                slug={slug}
                user={user}
                organization={organization}
                credits={credits}
                initialProjects={initialProjects}
                initialThreads={initialThreads}
                initialFavoriteAssets={initialFavoriteAssets}
                onItemClick={() => setDrawerOpen(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
