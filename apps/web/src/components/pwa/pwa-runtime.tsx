"use client";

import { useEffect, useState } from "react";

export function PwaRuntime() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    let alive = true;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((registration) => {
        if (!alive) return;
        if (registration.waiting && navigator.serviceWorker.controller)
          setWaiting(registration.waiting);
        const check = () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (
              installing.state === "installed" &&
              navigator.serviceWorker.controller &&
              alive
            )
              setWaiting(installing);
          });
        };
        registration.addEventListener("updatefound", check);
        const refresh = () => {
          if (document.visibilityState === "visible" && navigator.onLine)
            void registration.update();
        };
        document.addEventListener("visibilitychange", refresh);
        const controller = () => {
          if (updating) window.location.reload();
        };
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          controller,
        );
        // No uncontrolled timer, and no automatic activation that discards unsaved work.
        return () => {
          document.removeEventListener("visibilitychange", refresh);
          registration.removeEventListener("updatefound", check);
          navigator.serviceWorker.removeEventListener(
            "controllerchange",
            controller,
          );
        };
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [updating]);

  if (!waiting) return null;
  return (
    <aside
      role="status"
      className="fixed bottom-4 left-4 right-4 z-[90] mx-auto max-w-md rounded-2xl border border-border bg-card p-4 text-foreground shadow-xl sm:left-auto sm:right-5"
    >
      <p className="font-display text-base font-semibold">
        A new Creators version is ready
      </p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        Save your current work before updating. Generations already submitted
        continue on the server.
      </p>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
          onClick={() => {
            setUpdating(true);
            waiting.postMessage({ type: "SKIP_WAITING" });
          }}
        >
          Update Creators
        </button>
        <button
          type="button"
          className="text-xs font-semibold text-muted-foreground hover:text-foreground"
          onClick={() => setWaiting(null)}
        >
          Later
        </button>
      </div>
    </aside>
  );
}
