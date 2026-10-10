"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function DeviceSettings() {
  const [install, setInstall] = useState<InstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [worker, setWorker] = useState<
    "checking" | "ready" | "unsupported" | "error"
  >("checking");
  const [online, setOnline] = useState(true);
  const [push, setPush] = useState<
    | "checking"
    | "unsupported"
    | "disabled"
    | "enabled"
    | "unavailable"
    | "error"
  >("checking");
  const [message, setMessage] = useState("");
  const [periodic, setPeriodic] = useState<
    "unknown" | "ready" | "unavailable" | "enabled"
  >("unknown");

  useEffect(() => {
    setOnline(navigator.onLine);
    setStandalone(
      window.matchMedia("(display-mode: standalone)").matches ||
        ("standalone" in navigator &&
          Boolean(
            (navigator as Navigator & { standalone?: boolean }).standalone,
          )),
    );
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setStandalone(true);
      setInstall(null);
    };
    const onOnline = () => setOnline(navigator.onLine);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOnline);
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.ready
        .then((registration) => {
          setWorker("ready");
          setPeriodic("periodicSync" in registration ? "ready" : "unavailable");
        })
        .catch(() => setWorker("error"));
    } else {
      setWorker("unsupported");
      setPeriodic("unavailable");
    }
    if (!("PushManager" in window) || !("Notification" in window))
      setPush("unsupported");
    else
      void fetch("/api/pwa/push", { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) {
            setPush("unavailable");
            return;
          }
          const status = (await response.json()) as {
            available?: boolean;
          };
          const registration = await navigator.serviceWorker.ready;
          const current = await registration.pushManager.getSubscription();
          setPush(
            !status.available
              ? "unavailable"
              : current
                ? "enabled"
                : "disabled",
          );
        })
        .catch(() => setPush("unavailable"));
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOnline);
    };
  }, []);

  async function enablePeriodicRefresh() {
    try {
      const registration = (await navigator.serviceWorker
        .ready) as ServiceWorkerRegistration & {
        periodicSync?: {
          register(
            tag: string,
            options: { minInterval: number },
          ): Promise<void>;
        };
      };
      if (!registration.periodicSync) {
        setPeriodic("unavailable");
        return;
      }
      await registration.periodicSync.register("creators-public-refresh", {
        minInterval: 24 * 60 * 60 * 1000,
      });
      setPeriodic("enabled");
    } catch {
      setPeriodic("unavailable");
    }
  }

  async function installApp() {
    if (!install) return;
    await install.prompt();
    const decision = await install.userChoice;
    if (decision.outcome === "accepted") setInstall(null);
  }

  async function enablePush() {
    setMessage("");
    try {
      if (!("Notification" in window) || !("PushManager" in window)) return;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMessage(
          "Notifications were not permitted. You can change this in browser settings.",
        );
        return;
      }
      const status = await fetch("/api/pwa/push", { cache: "no-store" });
      if (!status.ok) throw new Error("Unable to load push configuration.");
      const config = (await status.json()) as { publicKey: string };
      const decode = (s: string) => {
        const binary = atob(
          s.replace(/-/g, "+").replace(/_/g, "/") +
            "=".repeat((4 - (s.length % 4)) % 4),
        );
        return Uint8Array.from(binary, (char) => char.charCodeAt(0));
      };
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decode(config.publicKey),
      });
      const result = await fetch("/api/pwa/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!result.ok) {
        await subscription.unsubscribe();
        throw new Error("Could not save your subscription.");
      }
      setPush("enabled");
      setMessage("Device notifications enabled.");
    } catch {
      setPush("error");
      setMessage(
        "Unable to enable notifications. Review browser permissions and try again.",
      );
    }
  }

  async function disablePush() {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch("/api/pwa/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        if (!response.ok) throw new Error("Unable to remove subscription.");
        await subscription.unsubscribe();
      }
      setPush("disabled");
      setMessage("Device notifications disabled.");
    } catch {
      setMessage("Could not disable this device. Try again.");
    }
  }

  return (
    <div className="grid gap-4">
      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-primary/10 p-3 text-primary">
            <Icon name="sparkles" className="size-8" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-semibold">
              Creators on your device
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Open your creative workspace directly from your home screen,
              desktop or taskbar. Features depend on the operating system and
              browser.
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          {install && !standalone && (
            <button
              type="button"
              onClick={() => void installApp()}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Install Creators
            </button>
          )}
          <span className="rounded-full border border-border px-3 py-2 text-xs text-muted-foreground">
            {standalone ? "Installed mode" : "Browser mode"}
          </span>
          <span className="rounded-full border border-border px-3 py-2 text-xs text-muted-foreground">
            {online ? "Online" : "Offline"}
          </span>
          <span className="rounded-full border border-border px-3 py-2 text-xs text-muted-foreground">
            Offline shell: {worker}
          </span>
        </div>
        {!install && !standalone && (
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            When supported, use your browser's Install app option. On iPhone,
            use Share → Add to Home Screen.
          </p>
        )}
      </section>
      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-3">
          <Icon name="bell" className="size-6 text-primary" />
          <h2 className="font-display text-xl font-semibold">
            Device notifications
          </h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Opt in to private, generic creation-status notifications. Your prompts
          and media previews are never included in a notification.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {push === "disabled" || push === "error" ? (
            <button
              type="button"
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
              onClick={() => void enablePush()}
            >
              Enable on this device
            </button>
          ) : null}
          {push === "enabled" ? (
            <button
              type="button"
              className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold"
              onClick={() => void disablePush()}
            >
              Disable on this device
            </button>
          ) : null}
          <span className="text-xs text-muted-foreground">
            {push === "unavailable"
              ? "Push server is not configured."
              : push === "unsupported"
                ? "Not supported on this browser."
                : push === "checking"
                  ? "Checking compatibility…"
                  : push === "enabled"
                    ? "Enabled"
                    : push === "disabled"
                      ? "Off"
                      : ""}
          </span>
        </div>
        {message && (
          <p role="status" className="mt-3 text-xs text-muted-foreground">
            {message}
          </p>
        )}
      </section>
      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <h2 className="font-display text-xl font-semibold">
          Offline learning refresh
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Optionally refresh eligible public Learn pages when your browser
          grants background access. Browsers control timing and may not support
          this feature; no personal data is fetched.
        </p>
        <div className="mt-4 flex items-center gap-3">
          {periodic === "ready" && (
            <button
              type="button"
              className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold"
              onClick={() => void enablePeriodicRefresh()}
            >
              Enable public refresh
            </button>
          )}
          <span className="text-xs text-muted-foreground">
            {periodic === "enabled"
              ? "Registered"
              : periodic === "unavailable"
                ? "Not available in this browser"
                : periodic === "ready"
                  ? "Available"
                  : "Checking support…"}
          </span>
        </div>
      </section>
      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <h2 className="font-display text-xl font-semibold">
          Your data stays under your control
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Only the public app shell and eligible Learn content may be saved by
          our Service Worker. Your wallet, conversations, original media and
          authenticated workspace responses are never placed in its shared HTTP
          caches. Paid jobs cannot be submitted offline.
        </p>
      </section>
    </div>
  );
}
