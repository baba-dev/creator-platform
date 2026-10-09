"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icon";
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

const SETTINGS_MENU_ITEMS: Array<{
  tab: SettingsTab;
  label: string;
  icon: IconName;
}> = [
  { tab: "profile", label: "Profile Settings", icon: "user" },
  {
    tab: "organization",
    label: "Organization Settings",
    icon: "projects",
  },
  { tab: "team", label: "Team & Members", icon: "admin" },
  { tab: "security", label: "Login & Security", icon: "shield" },
  { tab: "chatbot", label: "Chatbot Settings", icon: "bot" },
  { tab: "prompt-enhancement", label: "Prompt Enhance Model", icon: "sparkles" },
  { tab: "locale", label: "Locale Settings", icon: "globe" },
];

export function UserHeaderMenu({
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
            className="absolute right-0 top-full z-50 mt-2 max-h-[calc(100dvh-5rem)] w-64 overflow-y-auto rounded-2xl border border-border bg-card/95 p-1.5 shadow-xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
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
                <span className="max-w-[120px] truncate font-medium">
                  {organization.name}
                </span>
              </div>
            </div>

            {/* Settings Links */}
            <div className="space-y-0.5 py-1.5">
              {SETTINGS_MENU_ITEMS.map((item) => (
                <button
                  key={item.tab}
                  type="button"
                  onClick={() => openSettings(item.tab)}
                  role="menuitem"
                  className="group flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium text-foreground transition hover:bg-surface-sunken hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <Icon
                    name={item.icon}
                    className="size-4 shrink-0 text-muted-foreground transition group-hover:text-primary"
                  />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                </button>
              ))}
            </div>

            {/* Divider & Sign Out */}
            <div className="border-t border-border/80 pt-1">
              <button
                type="button"
                onClick={handleSignOut}
                disabled={isSigningOut}
                role="menuitem"
                className="flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-destructive transition hover:bg-destructive/10 focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Icon name="logout" className="size-4 shrink-0" />
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
