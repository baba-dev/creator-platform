"use client";

import { useCallback, useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { ProviderMark, type SocialProvider } from "./social-auth-buttons";

type LinkedAccount = { id: string; providerId: string };
type Device = {
  id: string;
  name?: string | null;
  createdAt?: Date | string;
  deviceType?: string;
  backedUp?: boolean;
};

function ConnectionArt() {
  return (
    <svg
      viewBox="0 0 240 116"
      role="img"
      aria-label="Secure identity linked to your creative workspace"
      className="h-28 w-full max-w-60 motion-safe:animate-[pulse_8s_ease-in-out_infinite]"
    >
      <defs>
        <linearGradient id="identity-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="currentColor" stopOpacity=".16" />
          <stop offset="1" stopColor="currentColor" stopOpacity=".025" />
        </linearGradient>
      </defs>
      <path
        d="M49 55h57m29 0h55M111 38l-11 17 11 17m19-34 11 17-11 17"
        stroke="currentColor"
        strokeOpacity=".3"
        strokeWidth="1.5"
        fill="none"
        strokeDasharray="3 5"
      />
      <rect
        x="6"
        y="24"
        width="45"
        height="61"
        rx="14"
        fill="url(#identity-gradient)"
        stroke="currentColor"
        strokeOpacity=".27"
      />
      <circle
        cx="28"
        cy="46"
        r="8"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="none"
      />
      <path
        d="M17 70c0-14 22-14 22 0"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
      />
      <rect
        x="97"
        y="25"
        width="46"
        height="61"
        rx="14"
        fill="url(#identity-gradient)"
        stroke="currentColor"
        strokeOpacity=".35"
      />
      <path
        d="m110 52 9 9 14-17"
        stroke="currentColor"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="186"
        y="24"
        width="48"
        height="61"
        rx="14"
        fill="url(#identity-gradient)"
        stroke="currentColor"
        strokeOpacity=".27"
      />
      <path
        d="M198 45h24v20h-24zM205 45v-5h9v5M204 57h12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="120" cy="11" r="2" fill="currentColor" opacity=".45" />
      <circle cx="167" cy="95" r="2" fill="currentColor" opacity=".45" />
    </svg>
  );
}

export function AccountConnections({
  googleEnabled,
  microsoftEnabled,
  allowPasswordless,
  returnTo,
}: {
  googleEnabled: boolean;
  microsoftEnabled: boolean;
  allowPasswordless: boolean;
  returnTo: string;
}) {
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [rename, setRename] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [linked, keys] = await Promise.all([
        authClient.listAccounts(),
        authClient.passkey.listUserPasskeys(),
      ]);
      if (linked.error || keys.error) {
        setMessage(
          "Some account connections could not be loaded. Please refresh.",
        );
      } else {
        setAccounts(
          (linked.data ?? []).map((a) => ({
            id: a.id,
            providerId: a.providerId,
          })),
        );
        setDevices(
          (keys.data ?? []).map((p) => ({
            id: p.id,
            name: p.name,
            createdAt: p.createdAt,
            deviceType: p.deviceType,
            backedUp: p.backedUp,
          })),
        );
      }
    } catch {
      setMessage("Connections could not be loaded. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) {
        void refresh();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  async function link(provider: SocialProvider) {
    setBusy(provider);
    setMessage(null);
    try {
      const result = await authClient.linkSocial({
        provider,
        callbackURL: returnTo,
      });
      if (result.error) throw new Error("link_failed");
    } catch {
      setMessage("Unable to connect this sign-in method. Please try again.");
      setBusy(null);
    }
  }

  async function unlink(account: LinkedAccount) {
    if (accounts.length + devices.length <= 1) {
      setMessage("Add another sign-in method before removing your last one.");
      return;
    }
    if (
      !window.confirm(
        `Remove ${account.providerId} sign-in from this Creators account?`,
      )
    )
      return;
    setBusy(account.providerId);
    setMessage(null);
    const result = await authClient.unlinkAccount({ accountId: account.id });
    setBusy(null);
    setMessage(
      result.error
        ? "Unable to disconnect this method."
        : "Sign-in method disconnected.",
    );
    if (!result.error) void refresh();
  }

  async function addDevice() {
    setBusy("passkey");
    setMessage(null);
    try {
      const result = await authClient.passkey.addPasskey({ name: "My device" });
      if (result.error) throw new Error("registration_failed");
      setMessage(
        "Passkey added. Your device PIN or biometrics can now sign you in.",
      );
      await refresh();
    } catch {
      setMessage("Passkey registration was cancelled or could not complete.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteDevice(device: Device) {
    if (devices.length + accounts.length <= 1) {
      setMessage(
        "Keep at least one sign-in method before removing this passkey.",
      );
      return;
    }
    if (!window.confirm(`Remove passkey “${device.name || "Passkey"}”?`))
      return;
    setBusy(device.id);
    setMessage(null);
    const result = await authClient.passkey.deletePasskey({ id: device.id });
    setBusy(null);
    setMessage(
      result.error ? "Unable to remove the passkey." : "Passkey removed.",
    );
    if (!result.error) void refresh();
  }

  async function saveName(id: string) {
    const next = name.trim();
    if (!next || next.length > 64) {
      setMessage("Device names must be 1–64 characters.");
      return;
    }
    setBusy(id);
    setMessage(null);
    const result = await authClient.passkey.updatePasskey({ id, name: next });
    setBusy(null);
    if (result.error) setMessage("Unable to rename this passkey.");
    else {
      setRename(null);
      setName("");
      void refresh();
    }
  }

  return (
    <section
      aria-labelledby="account-connections-heading"
      className="space-y-5"
    >
      <div className="relative overflow-hidden rounded-[28px] border border-primary/15 bg-primary/[0.04] p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative grid gap-5 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[.16em] text-primary">
              Personal identity
            </p>
            <h2
              id="account-connections-heading"
              className="mt-2 font-display text-2xl font-semibold tracking-tight text-foreground"
            >
              Your account, your way.
            </h2>
            <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
              Link sign-in providers and trusted devices. These connections
              belong to you, not to your organization&apos;s shared storage.
            </p>
          </div>
          <ConnectionArt />
        </div>
      </div>

      {message ? (
        <p
          role="status"
          className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground"
        >
          {message}
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            ["google", googleEnabled],
            ["microsoft", microsoftEnabled],
          ] as const
        ).map(([provider, enabled]) => {
          const connected = accounts.find((a) => a.providerId === provider);
          return (
            <div
              key={provider}
              className="rounded-2xl border border-border bg-card p-5 shadow-xs transition-[border-color,transform] motion-safe:hover:-translate-y-0.5 hover:border-primary/35"
            >
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-muted/40">
                  <ProviderMark provider={provider} />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-foreground">
                    {provider === "google" ? "Google" : "Microsoft"}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {loading
                      ? "Checking…"
                      : connected
                        ? "Connected for sign-in"
                        : enabled
                          ? "Not connected"
                          : "Unavailable"}
                  </p>
                </div>
                {connected ? (
                  <span className="rounded-full bg-success/10 px-2 py-1 text-[10px] font-semibold text-success">
                    Linked
                  </span>
                ) : null}
              </div>
              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                Sign-in only. Cloud storage requires separate consent.
              </p>
              <Button
                type="button"
                variant="secondary"
                className="mt-4 w-full"
                disabled={loading || !!busy || !enabled || !allowPasswordless}
                onClick={() =>
                  connected ? void unlink(connected) : void link(provider)
                }
              >
                {busy === provider
                  ? "Working…"
                  : connected
                    ? "Disconnect sign-in"
                    : enabled
                      ? "Connect account"
                      : "Not configured"}
              </Button>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
              <svg
                width="25"
                height="25"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              >
                <path d="M12 11a3 3 0 0 0-3 3v3m6 0v-3a3 3 0 0 0-6 0m9 3v-3a6 6 0 0 0-12 0v2m6 1v2m-4-1v1m8-2v2M12 2c5 0 9 4 9 9M3 11c0-5 4-9 9-9" />
              </svg>
            </span>
            <div>
              <h3 className="text-base font-semibold">
                Passkeys & trusted devices
              </h3>
              <p className="text-xs text-muted-foreground">
                Windows Hello, Android, and compatible authenticators
              </p>
            </div>
          </div>
          <Button
            type="button"
            disabled={!!busy || loading || !allowPasswordless}
            onClick={() => void addDevice()}
          >
            {busy === "passkey" ? "Registering…" : "Add a passkey"}
          </Button>
        </div>
        {!allowPasswordless ? (
          <p className="mt-4 text-xs text-muted-foreground">
            Privileged accounts must continue using email/password plus
            authenticator MFA until additional step-up verification is
            available.
          </p>
        ) : null}
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          Your device verifies its own PIN or biometrics. Creators stores only a
          public-key credential, never your device PIN. Keep a backup sign-in
          method for recovery.
        </p>
        <div className="mt-5 space-y-2">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading devices…</p>
          ) : devices.length === 0 ? (
            <p className="rounded-xl bg-muted/30 p-4 text-sm text-muted-foreground">
              No passkeys yet. Add your first trusted device for fast,
              passwordless sign-in.
            </p>
          ) : (
            devices.map((device) => (
              <div
                key={device.id}
                className="rounded-xl border border-border p-3 sm:p-4"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className="grid size-9 place-items-center rounded-lg bg-muted/50"
                    aria-hidden="true"
                  >
                    ◇
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {device.name || "Passkey"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {device.backedUp ? "Synced passkey" : "Device credential"}{" "}
                      · Added{" "}
                      {device.createdAt
                        ? new Date(device.createdAt).toLocaleDateString()
                        : "recently"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!!busy}
                    onClick={() => {
                      setRename(device.id);
                      setName(device.name || "");
                    }}
                  >
                    Rename
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!!busy}
                    className="text-destructive"
                    onClick={() => void deleteDevice(device)}
                  >
                    {busy === device.id ? "Working…" : "Remove"}
                  </Button>
                </div>
                {rename === device.id ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <input
                      aria-label="New device name"
                      className="form-control min-w-40 flex-1"
                      maxLength={64}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                    <Button
                      size="sm"
                      disabled={!!busy}
                      onClick={() => void saveName(device.id)}
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setRename(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
