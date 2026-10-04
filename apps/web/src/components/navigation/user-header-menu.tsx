"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { authClient } from "@/lib/auth-client";
import { SettingsModal, type SettingsTab } from "./settings-modal";

interface UserHeaderMenuProps {
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
}

export function UserHeaderMenu({
  slug,
  user,
  organization,
  role,
}: UserHeaderMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settingsModalTab, setSettingsModalTab] =
    useState<SettingsTab>("profile");
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  async function handleSignOut() {
    setIsSigningOut(true);
    await authClient.signOut();
    router.push("/sign-in");
    router.refresh();
  }

  function openSettings(tab: SettingsTab) {
    setSettingsModalTab(tab);
    setSettingsModalOpen(true);
    setIsOpen(false);
  }

  // Get user initials (e.g. "Baba Bhayanak" -> "BB")
  const initials =
    user.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U";

  return (
    <>
      <div ref={menuRef} className="relative inline-block text-left">
        {/* Username trigger button */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-haspopup="true"
          className="group flex h-9 items-center gap-2 rounded-xl border border-border/70 bg-card/80 px-2.5 text-xs font-semibold text-foreground shadow-2xs transition hover:border-primary/40 hover:bg-card focus-visible:outline-2 focus-visible:outline-ring"
        >
          {/* Avatar initial circle */}
          <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-primary/15 font-mono text-[11px] font-bold text-primary">
            {initials}
          </span>
          <span className="max-w-[130px] truncate">{user.name}</span>
          <Icon
            name="chevron"
            className={`size-3 text-muted-foreground transition-transform duration-200 ${
              isOpen ? "rotate-90" : ""
            }`}
          />
        </button>

        {/* Minimal Dropdown Menu */}
        {isOpen && (
          <div
            className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-border bg-card/95 p-1.5 shadow-xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
            role="menu"
            aria-orientation="vertical"
          >
            {/* User Header */}
            <div className="border-b border-border/80 px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary/15 font-mono text-xs font-bold text-primary">
                  {initials}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-bold text-foreground">
                    {user.name}
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {user.email}
                  </div>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                <span className="font-mono uppercase">{role}</span>
                <span className="truncate max-w-[120px] font-medium">
                  {organization.name}
                </span>
              </div>
            </div>

            {/* Minimal Settings Links */}
            <div className="space-y-0.5 py-1.5">
              <button
                type="button"
                onClick={() => openSettings("profile")}
                role="menuitem"
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium text-foreground transition hover:bg-surface-sunken hover:text-primary"
              >
                <Icon name="user" className="size-4 text-muted-foreground" />
                <span>Profile Settings</span>
              </button>

              <button
                type="button"
                onClick={() => openSettings("organization")}
                role="menuitem"
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium text-foreground transition hover:bg-surface-sunken hover:text-primary"
              >
                <Icon
                  name="projects"
                  className="size-4 text-muted-foreground"
                />
                <span>Organization Settings</span>
              </button>

              <Link
                href={`/app/${slug}/members` as Route}
                onClick={() => setIsOpen(false)}
                role="menuitem"
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium text-foreground transition hover:bg-surface-sunken hover:text-primary"
              >
                <Icon name="admin" className="size-4 text-muted-foreground" />
                <span>Team Settings</span>
              </Link>

              <button
                type="button"
                onClick={() => openSettings("security")}
                role="menuitem"
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium text-foreground transition hover:bg-surface-sunken hover:text-primary"
              >
                <Icon name="shield" className="size-4 text-muted-foreground" />
                <span>Login & Security</span>
              </button>

              <button
                type="button"
                onClick={() => openSettings("chatbot")}
                role="menuitem"
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium text-foreground transition hover:bg-surface-sunken hover:text-primary"
              >
                <Icon name="bot" className="size-4 text-muted-foreground" />
                <span>Chatbot Settings</span>
              </button>

              <button
                type="button"
                onClick={() => openSettings("locale")}
                role="menuitem"
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium text-foreground transition hover:bg-surface-sunken hover:text-primary"
              >
                <Icon name="globe" className="size-4 text-muted-foreground" />
                <span>Locale Settings</span>
              </button>
            </div>

            {/* Divider & Sign Out */}
            <div className="border-t border-border/80 pt-1">
              <button
                type="button"
                onClick={handleSignOut}
                disabled={isSigningOut}
                role="menuitem"
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-destructive transition hover:bg-destructive/10"
              >
                <Icon name="logout" className="size-4" />
                <span>{isSigningOut ? "Signing out…" : "Log Out"}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Settings Modal Dialog */}
      <SettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        defaultTab={settingsModalTab}
        user={user}
        organization={organization}
      />
    </>
  );
}
