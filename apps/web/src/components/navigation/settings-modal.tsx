"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Icon, type IconName } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";

export type SettingsTab =
  "profile" | "organization" | "team" | "security" | "chatbot" | "locale";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: SettingsTab;
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
}

export function SettingsModal({
  isOpen,
  onClose,
  defaultTab = "profile",
  user,
  organization,
}: SettingsModalProps) {
  const [tabOverride, setTabOverride] = useState<SettingsTab | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [prevDefaultTab, setPrevDefaultTab] = useState(defaultTab);

  if (prevDefaultTab !== defaultTab) {
    setPrevDefaultTab(defaultTab);
    setTabOverride(null);
    setSavedMessage(null);
  }

  const activeTab = tabOverride ?? defaultTab;

  // Handle ESC key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const tabs: Array<{ id: SettingsTab; label: string; icon: IconName }> = [
    { id: "profile", label: "Profile", icon: "user" },
    { id: "organization", label: "Organization", icon: "projects" },
    { id: "team", label: "Team & Access", icon: "admin" },
    { id: "security", label: "Login & Security", icon: "shield" },
    { id: "chatbot", label: "Chatbot & AI", icon: "bot" },
    { id: "locale", label: "Locale & Region", icon: "globe" },
  ];

  function triggerSave(msg: string) {
    setSavedMessage(msg);
    setTimeout(() => setSavedMessage(null), 3000);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-background/80 backdrop-blur-md transition-opacity animate-in fade-in"
      />

      {/* Modal Surface */}
      <div className="relative flex h-[600px] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-200 sm:flex-row">
        {/* Left Navigation Tabs */}
        <aside className="w-full border-b border-border bg-sidebar/60 p-4 sm:w-56 sm:border-b-0 sm:border-r">
          <div className="mb-4 flex items-center justify-between px-2">
            <h2
              id="settings-dialog-title"
              className="font-display text-base font-bold text-foreground"
            >
              Settings
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close settings"
              className="rounded-lg p-1 text-muted-foreground hover:bg-card hover:text-foreground sm:hidden"
            >
              ✕
            </button>
          </div>

          <nav className="flex gap-1 overflow-x-auto sm:flex-col sm:overflow-visible">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setTabOverride(tab.id)}
                  className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-card hover:text-foreground"
                  }`}
                >
                  <Icon name={tab.icon} className="size-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Right Content Area */}
        <div className="flex flex-1 flex-col overflow-y-auto p-6">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <h3 className="font-display text-lg font-bold text-foreground">
                {tabs.find((t) => t.id === activeTab)?.label}
              </h3>
              <p className="text-xs text-muted-foreground">
                Manage your preferences and configuration for Aiwa Creator.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close settings"
              className="hidden rounded-lg p-1.5 text-muted-foreground hover:bg-surface-sunken hover:text-foreground sm:inline-flex"
            >
              ✕
            </button>
          </div>

          {savedMessage && (
            <div className="mt-4 rounded-xl border border-success/30 bg-success/10 p-3 text-xs font-semibold text-success animate-in fade-in">
              ✓ {savedMessage}
            </div>
          )}

          <div className="mt-6 flex-1 space-y-5 text-sm">
            {/* Tab: Profile */}
            {activeTab === "profile" && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-foreground">
                    Display Name
                  </label>
                  <input
                    type="text"
                    defaultValue={user.name}
                    readOnly
                    className="mt-1 w-full rounded-xl border border-border bg-surface-sunken px-3.5 py-2 text-xs font-medium text-foreground outline-hidden focus:border-primary"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Managed via authentication profile.
                  </p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground">
                    Email Address
                  </label>
                  <input
                    type="email"
                    defaultValue={user.email}
                    readOnly
                    className="mt-1 w-full rounded-xl border border-border bg-surface-sunken px-3.5 py-2 text-xs font-medium text-foreground outline-hidden"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground">
                    Account ID
                  </label>
                  <div className="mt-1 rounded-xl border border-border bg-surface-sunken px-3.5 py-2 font-mono text-[11px] text-muted-foreground">
                    {user.id}
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Organization */}
            {activeTab === "organization" && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-foreground">
                    Workspace Name
                  </label>
                  <input
                    type="text"
                    defaultValue={organization.name}
                    readOnly
                    className="mt-1 w-full rounded-xl border border-border bg-surface-sunken px-3.5 py-2 text-xs font-medium text-foreground outline-hidden"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground">
                    Workspace Slug
                  </label>
                  <input
                    type="text"
                    defaultValue={organization.slug}
                    readOnly
                    className="mt-1 w-full rounded-xl border border-border bg-surface-sunken px-3.5 py-2 text-xs font-medium text-foreground outline-hidden"
                  />
                </div>
                <div className="pt-2">
                  <Link
                    href={`/app/${organization.slug}/storage` as Route}
                    onClick={onClose}
                    className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground transition hover:border-primary/40"
                  >
                    <Icon name="settings" className="size-3.5" />
                    <span>Manage Storage & Cloud Providers</span>
                  </Link>
                </div>
              </div>
            )}

            {/* Tab: Team & Access */}
            {activeTab === "team" && (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Manage collaborators, assign roles (Owner, Admin, Member), and
                  enforce monthly credit spending caps.
                </p>
                <div className="rounded-xl border border-border bg-surface-sunken p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-foreground">
                        Organization Members
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Invite teammates and configure workspace permissions.
                      </div>
                    </div>
                    <Link
                      href={`/app/${organization.slug}/members` as Route}
                      onClick={onClose}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-xs transition hover:opacity-90"
                    >
                      <Icon name="admin" className="size-3.5" />
                      <span>Open Team Management</span>
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Login & Security */}
            {activeTab === "security" && (
              <div className="space-y-4">
                <div className="rounded-xl border border-border bg-surface-sunken p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-foreground">
                        Two-Factor Authentication (2FA / MFA)
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Protect your account with Time-based One-Time Passwords
                        (TOTP).
                      </div>
                    </div>
                    <Link
                      href={"/admin/mfa-setup" as Route}
                      onClick={onClose}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:border-primary/40"
                    >
                      <Icon name="shield" className="size-3.5" />
                      <span>Configure 2FA</span>
                    </Link>
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-surface-sunken p-4">
                  <div className="text-xs font-bold text-foreground">
                    Password & Session Security
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Sessions are cryptographically verified and signed.
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Chatbot & AI */}
            {activeTab === "chatbot" && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-foreground">
                    Default Model
                  </label>
                  <select
                    defaultValue="doubao-seed-character-260628"
                    onChange={() => triggerSave("AI preferences updated.")}
                    className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground outline-hidden focus:border-primary"
                  >
                    <option value="doubao-seed-character-260628">
                      Doubao Seed Character (Roleplay & Conversational)
                    </option>
                    <option value="dola-seed-2-1-turbo-260628">
                      Dola Seed 2.1 Turbo (Fast Multi-turn)
                    </option>
                    <option value="seed-2-0-pro-260328">
                      Seed 2.0 Pro (Deep Creative Reasoning)
                    </option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground">
                    Auto-Voice Synthesis
                  </label>
                  <p className="text-[11px] text-muted-foreground">
                    Automatically synthesize vocal replies from character
                    personas during generation chats.
                  </p>
                </div>
              </div>
            )}

            {/* Tab: Locale & Region */}
            {activeTab === "locale" && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-foreground">
                    Interface Language
                  </label>
                  <select
                    defaultValue="en"
                    onChange={() => triggerSave("Locale preference updated.")}
                    className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground outline-hidden focus:border-primary"
                  >
                    <option value="en">English (US / UK)</option>
                    <option value="ar">
                      العربية (Arabic - Regional GCC / Oman)
                    </option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground">
                    Currency Formatting
                  </label>
                  <div className="mt-1 rounded-xl border border-border bg-surface-sunken p-3 text-xs text-muted-foreground">
                    OMR (Integer Baisa) & Platform Credits (1 credit = 1 baisa).
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 flex justify-end border-t border-border pt-4">
            <Button size="sm" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
