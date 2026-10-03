"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

export interface StorageConfigRow {
  id: string;
  provider: "LOCAL" | "GOOGLE_DRIVE" | "ONEDRIVE" | "S3";
  status: string;
  accountEmail: string | null;
  rootFolderName: string;
  createdAt: string;
}

export interface StorageManagerProps {
  organizationId: string;
  activeProvider: "LOCAL" | "GOOGLE_DRIVE" | "ONEDRIVE" | "S3";
  canManage: boolean;
  googleConfigured: boolean;
  oneDriveConfigured: boolean;
  configs: StorageConfigRow[];
  connectedParam?: string;
  errorParam?: string;
}

export function StorageManager({
  organizationId,
  activeProvider: initialActiveProvider,
  canManage,
  googleConfigured,
  oneDriveConfigured,
  configs: initialConfigs,
  connectedParam,
  errorParam,
}: StorageManagerProps) {
  const [activeProvider, setActiveProvider] = useState(initialActiveProvider);
  const [configs, setConfigs] = useState<StorageConfigRow[]>(initialConfigs);
  const [switching, setSwitching] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(
    connectedParam
      ? `Successfully connected ${connectedParam === "google_drive" ? "Google Drive" : "OneDrive"}! Originals will now be stored in your Creators-Data folder.`
      : errorParam
        ? `Failed to connect storage: ${errorParam.replace(/_/g, " ")}`
        : null,
  );

  const googleConfig = configs.find((c) => c.provider === "GOOGLE_DRIVE");
  const oneDriveConfig = configs.find((c) => c.provider === "ONEDRIVE");

  const handleSetActive = async (
    provider: "LOCAL" | "GOOGLE_DRIVE" | "ONEDRIVE",
  ) => {
    if (!canManage) return;
    setSwitching(provider);
    setMessage(null);
    try {
      const res = await fetch("/api/storage/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, provider }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to switch storage provider");
      }
      setActiveProvider(provider);
      setMessage(
        `Active storage updated to ${provider === "LOCAL" ? "Platform Storage" : provider === "GOOGLE_DRIVE" ? "Google Drive" : "OneDrive"}.`,
      );
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Error switching storage",
      );
    } finally {
      setSwitching(null);
    }
  };

  const handleDisconnect = async (provider: "GOOGLE_DRIVE" | "ONEDRIVE") => {
    if (!canManage) return;
    if (
      !confirm(
        `Are you sure you want to disconnect ${provider === "GOOGLE_DRIVE" ? "Google Drive" : "OneDrive"}?`,
      )
    ) {
      return;
    }
    setDisconnecting(provider);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/storage/config?organizationId=${encodeURIComponent(organizationId)}&provider=${encodeURIComponent(provider)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to disconnect storage");
      }
      setConfigs((prev) => prev.filter((c) => c.provider !== provider));
      if (activeProvider === provider) {
        setActiveProvider("LOCAL");
      }
      setMessage(
        `Disconnected ${provider === "GOOGLE_DRIVE" ? "Google Drive" : "OneDrive"}. Defaulted back to Platform Storage.`,
      );
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Error disconnecting storage",
      );
    } finally {
      setDisconnecting(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Banner / Explanation */}
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6 backdrop-blur">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
            <Icon name="assets" className="size-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground">
              Bring Your Own Storage (Hybrid Model)
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Connect your personal or enterprise cloud drive to store heavy
              media originals. Our app only requests access to create and manage
              a dedicated{" "}
              <strong className="text-foreground">Creators-Data</strong> folder
              on your drive. Lightweight previews (thumbnails, posters) remain
              cached on platform storage so your gallery loads instantaneously.
            </p>
          </div>
        </div>
      </div>

      {message && (
        <div className="rounded-xl border border-border bg-card p-4 text-sm font-medium text-foreground">
          {message}
        </div>
      )}

      {/* Storage Options Grid */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Google Drive Card */}
        <div
          className={`relative flex flex-col justify-between rounded-2xl border p-6 transition-all ${activeProvider === "GOOGLE_DRIVE" ? "border-primary bg-primary/[0.02] shadow-sm" : "border-border bg-card"}`}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">
                  G
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">
                    Google Drive
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    drive.file scope
                  </p>
                </div>
              </div>
              {activeProvider === "GOOGLE_DRIVE" && (
                <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
                  Active
                </span>
              )}
            </div>

            <div className="space-y-2 rounded-xl bg-muted/40 p-3.5 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>Folder:</span>
                <span className="font-medium text-foreground">
                  📁 Creators-Data
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Status:</span>
                <span
                  className={`font-semibold ${googleConfig ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}
                >
                  {googleConfig ? "Connected" : "Not connected"}
                </span>
              </div>
              {googleConfig?.accountEmail && (
                <div className="flex justify-between text-muted-foreground truncate">
                  <span>Account:</span>
                  <span className="font-medium text-foreground truncate max-w-[150px]">
                    {googleConfig.accountEmail}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-2">
            {!googleConfig ? (
              <Button
                variant="secondary"
                className="w-full justify-center"
                disabled={!canManage || !googleConfigured}
                asChild={canManage && googleConfigured}
              >
                {canManage && googleConfigured ? (
                  <a
                    href={`/api/storage/oauth/google/start?organizationId=${encodeURIComponent(organizationId)}`}
                  >
                    Connect Google Drive
                  </a>
                ) : (
                  <span>
                    {!googleConfigured
                      ? "OAuth Not Configured"
                      : "Owner Access Required"}
                  </span>
                )}
              </Button>
            ) : (
              <>
                {activeProvider !== "GOOGLE_DRIVE" && (
                  <Button
                    variant="default"
                    className="w-full justify-center"
                    disabled={!canManage || switching === "GOOGLE_DRIVE"}
                    onClick={() => handleSetActive("GOOGLE_DRIVE")}
                  >
                    {switching === "GOOGLE_DRIVE"
                      ? "Activating..."
                      : "Set as Active Storage"}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  className="w-full justify-center text-destructive hover:bg-destructive/10"
                  disabled={!canManage || disconnecting === "GOOGLE_DRIVE"}
                  onClick={() => handleDisconnect("GOOGLE_DRIVE")}
                >
                  {disconnecting === "GOOGLE_DRIVE"
                    ? "Disconnecting..."
                    : "Disconnect"}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* OneDrive Card */}
        <div
          className={`relative flex flex-col justify-between rounded-2xl border p-6 transition-all ${activeProvider === "ONEDRIVE" ? "border-primary bg-primary/[0.02] shadow-sm" : "border-border bg-card"}`}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 font-bold">
                  M
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">
                    Microsoft OneDrive
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Direct CDN Stream
                  </p>
                </div>
              </div>
              {activeProvider === "ONEDRIVE" && (
                <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
                  Active
                </span>
              )}
            </div>

            <div className="space-y-2 rounded-xl bg-muted/40 p-3.5 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>Folder:</span>
                <span className="font-medium text-foreground">
                  📁 Creators-Data
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Status:</span>
                <span
                  className={`font-semibold ${oneDriveConfig ? "text-sky-600 dark:text-sky-400" : "text-muted-foreground"}`}
                >
                  {oneDriveConfig ? "Connected" : "Not connected"}
                </span>
              </div>
              {oneDriveConfig?.accountEmail && (
                <div className="flex justify-between text-muted-foreground truncate">
                  <span>Account:</span>
                  <span className="font-medium text-foreground truncate max-w-[150px]">
                    {oneDriveConfig.accountEmail}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-2">
            {!oneDriveConfig ? (
              <Button
                variant="secondary"
                className="w-full justify-center"
                disabled={!canManage || !oneDriveConfigured}
                asChild={canManage && oneDriveConfigured}
              >
                {canManage && oneDriveConfigured ? (
                  <a
                    href={`/api/storage/oauth/onedrive/start?organizationId=${encodeURIComponent(organizationId)}`}
                  >
                    Connect OneDrive
                  </a>
                ) : (
                  <span>
                    {!oneDriveConfigured
                      ? "OAuth Not Configured"
                      : "Owner Access Required"}
                  </span>
                )}
              </Button>
            ) : (
              <>
                {activeProvider !== "ONEDRIVE" && (
                  <Button
                    variant="default"
                    className="w-full justify-center"
                    disabled={!canManage || switching === "ONEDRIVE"}
                    onClick={() => handleSetActive("ONEDRIVE")}
                  >
                    {switching === "ONEDRIVE"
                      ? "Activating..."
                      : "Set as Active Storage"}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  className="w-full justify-center text-destructive hover:bg-destructive/10"
                  disabled={!canManage || disconnecting === "ONEDRIVE"}
                  onClick={() => handleDisconnect("ONEDRIVE")}
                >
                  {disconnecting === "ONEDRIVE"
                    ? "Disconnecting..."
                    : "Disconnect"}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Platform Storage Card */}
        <div
          className={`relative flex flex-col justify-between rounded-2xl border p-6 transition-all ${activeProvider === "LOCAL" ? "border-primary bg-primary/[0.02] shadow-sm" : "border-border bg-card"}`}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
                  <Icon name="assets" className="size-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">
                    Platform Storage
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Standard Local Disk
                  </p>
                </div>
              </div>
              {activeProvider === "LOCAL" && (
                <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
                  Active
                </span>
              )}
            </div>

            <div className="space-y-2 rounded-xl bg-muted/40 p-3.5 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>Location:</span>
                <span className="font-medium text-foreground">
                  Server Storage
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Status:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  Always Available
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Quotas:</span>
                <span className="font-medium text-foreground">
                  Platform Quota Applies
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-2">
            {activeProvider !== "LOCAL" ? (
              <Button
                variant="secondary"
                className="w-full justify-center"
                disabled={!canManage || switching === "LOCAL"}
                onClick={() => handleSetActive("LOCAL")}
              >
                {switching === "LOCAL"
                  ? "Switching..."
                  : "Switch to Platform Storage"}
              </Button>
            ) : (
              <div className="flex h-10 items-center justify-center text-xs font-medium text-muted-foreground">
                Currently default for all assets
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
