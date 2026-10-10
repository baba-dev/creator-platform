"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

type PoolSummary = {
  provider: "LOCAL" | "GOOGLE_DRIVE" | "ONEDRIVE";
  yourUsedBytes: string;
  status: string;
  quota: {
    totalBytes: string | null;
    usedBytes: string;
    availableBytes: string | null;
  } | null;
};

function formatBytes(value: string | null) {
  if (value === null) return "Not reported";
  const bytes = BigInt(value);
  const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
  let divisor = 1n;
  let unit = 0;
  while (bytes >= divisor * 1024n && unit < units.length - 1) {
    divisor *= 1024n;
    unit++;
  }
  return `${Number((bytes * 100n) / divisor) / 100} ${units[unit]}`;
}

function PoolUsage({
  pool,
  failed,
  local,
}: {
  pool?: PoolSummary;
  failed: boolean;
  local?: boolean;
}) {
  return (
    <div
      className="space-y-2 rounded-xl bg-muted/40 p-3.5 text-xs tabular-nums"
      aria-live="polite"
    >
      {!pool ? (
        <p className="text-muted-foreground">
          {failed
            ? "Usage unavailable. Reload to retry."
            : "Loading storage usage…"}
        </p>
      ) : (
        <>
          <div className="flex justify-between gap-3">
            <span>Your assets in this pool</span>
            <span>{formatBytes(pool.yourUsedBytes)}</span>
          </div>
          {pool.quota ? (
            <>
              <div className="flex justify-between gap-3">
                <span>{local ? "Your app quota" : "Account total"}</span>
                <span>{formatBytes(pool.quota.totalBytes)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>{local ? "Your app usage" : "Account used"}</span>
                <span>{formatBytes(pool.quota.usedBytes)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>
                  {local ? "Available for new assets" : "Account free"}
                </span>
                <span>{formatBytes(pool.quota.availableBytes)}</span>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">
              {pool.status === "disconnected"
                ? "Connect to view account capacity."
                : pool.status === "reconnect"
                  ? "Reconnect to view account capacity."
                  : "Account capacity temporarily unavailable."}
            </p>
          )}
          <p className="text-muted-foreground">
            {local
              ? "App quota covers all pools, previews and retained trash. Free space also respects workspace limits and reservations."
              : "Account capacity is shared with other files and services; your app quota still applies."}
          </p>
        </>
      )}
    </div>
  );
}

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
  const mutationPending = useRef(false);
  const [pools, setPools] = useState<PoolSummary[]>([]);
  const [usageFailed, setUsageFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(
      `/api/storage/usage?organizationId=${encodeURIComponent(organizationId)}`,
      { signal: controller.signal, cache: "no-store" },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("Usage unavailable");
        const data = await response.json();
        if (!controller.signal.aborted) setPools(data.pools);
      })
      .catch(() => {
        if (!controller.signal.aborted) setUsageFailed(true);
      });
    return () => controller.abort();
  }, [organizationId]);
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
    if (!canManage || mutationPending.current) return;
    mutationPending.current = true;
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
      mutationPending.current = false;
      setSwitching(null);
    }
  };

  const handleDisconnect = async (provider: "GOOGLE_DRIVE" | "ONEDRIVE") => {
    if (!canManage || mutationPending.current) return;
    if (
      !confirm(
        `Are you sure you want to disconnect ${provider === "GOOGLE_DRIVE" ? "Google Drive" : "OneDrive"}?`,
      )
    ) {
      return;
    }
    mutationPending.current = true;
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
      setPools((prev) =>
        prev.map((pool) =>
          pool.provider === provider
            ? { ...pool, status: "disconnected", quota: null }
            : pool,
        ),
      );
      setMessage(
        `Disconnected ${provider === "GOOGLE_DRIVE" ? "Google Drive" : "OneDrive"}.${activeProvider === provider ? " Defaulted back to Platform Storage." : ""}`,
      );
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Error disconnecting storage",
      );
    } finally {
      mutationPending.current = false;
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
        <div
          role="status"
          className="rounded-xl border border-border bg-card p-4 text-sm font-medium text-foreground"
        >
          {message}
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        Connections and active storage are shared by this workspace. Usage below
        is for your assets, including previews and retained trash. Changing the
        active pool affects new assets; existing files stay in their current
        pool.
      </p>
      {/* Storage Options Grid */}
      <div className="grid gap-5">
        {/* Google Drive Card */}
        <div
          className={`relative flex flex-col justify-between rounded-2xl border p-6 transition-all ${activeProvider === "GOOGLE_DRIVE" ? "border-primary bg-primary/[0.02] shadow-sm" : "border-border bg-card"}`}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-success/10 text-success font-bold">
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
                  className={`font-semibold ${googleConfig ? "text-success" : "text-muted-foreground"}`}
                >
                  {googleConfig?.status === "ACTIVE"
                    ? "Connected"
                    : googleConfig
                      ? "Reconnect required"
                      : "Not connected"}
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
            <PoolUsage
              pool={pools.find((pool) => pool.provider === "GOOGLE_DRIVE")}
              failed={usageFailed}
            />
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
                    disabled={
                      !canManage ||
                      !!switching ||
                      !!disconnecting ||
                      googleConfig.status !== "ACTIVE" ||
                      !googleConfigured
                    }
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
                  disabled={!canManage || !!switching || !!disconnecting}
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
                <div className="flex size-10 items-center justify-center rounded-xl bg-info/10 text-info font-bold">
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
                  className={`font-semibold ${oneDriveConfig ? "text-success" : "text-muted-foreground"}`}
                >
                  {oneDriveConfig?.status === "ACTIVE"
                    ? "Connected"
                    : oneDriveConfig
                      ? "Reconnect required"
                      : "Not connected"}
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
            <PoolUsage
              pool={pools.find((pool) => pool.provider === "ONEDRIVE")}
              failed={usageFailed}
            />
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
                    disabled={
                      !canManage ||
                      !!switching ||
                      !!disconnecting ||
                      oneDriveConfig.status !== "ACTIVE" ||
                      !oneDriveConfigured
                    }
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
                  disabled={!canManage || !!switching || !!disconnecting}
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
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
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
                <span className="font-semibold text-success">
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
            <PoolUsage
              pool={pools.find((pool) => pool.provider === "LOCAL")}
              failed={usageFailed}
              local
            />
          </div>

          <div className="mt-6 flex flex-col gap-2">
            {activeProvider !== "LOCAL" ? (
              <Button
                variant="default"
                className="w-full justify-center"
                disabled={!canManage || !!switching || !!disconnecting}
                onClick={() => handleSetActive("LOCAL")}
              >
                {switching === "LOCAL"
                  ? "Activating..."
                  : "Set as Active Storage"}
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
