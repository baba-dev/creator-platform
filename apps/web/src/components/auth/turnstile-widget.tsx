"use client";

import { useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      theme: "auto";
      size: "flexible";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/** One reusable widget for signup and recovery. Tokens remain only in component state. */
export function TurnstileWidget({
  siteKey,
  action,
  onTokenChange,
  resetKey = 0,
}: {
  siteKey: string;
  action: "signup" | "password_reset";
  onTokenChange: (token: string | null) => void;
  resetKey?: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onTokenChange);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    callbackRef.current = onTokenChange;
  }, [onTokenChange]);

  useEffect(() => {
    let disposed = false;
    let widgetId: string | undefined;
    let script: HTMLScriptElement | null = null;

    const render = () => {
      if (disposed || !container.current || !window.turnstile || widgetId)
        return;
      widgetId = window.turnstile.render(container.current, {
        sitekey: siteKey,
        action,
        theme: "auto",
        size: "flexible",
        callback: (token) => {
          setFailed(false);
          callbackRef.current(token);
        },
        "expired-callback": () => callbackRef.current(null),
        "error-callback": () => {
          callbackRef.current(null);
          setFailed(true);
        },
      });
    };
    const onScriptError = () => {
      if (!disposed) setFailed(true);
    };

    if (window.turnstile) {
      render();
    } else {
      script = document.querySelector<HTMLScriptElement>(
        'script[data-creators-turnstile="true"]',
      );
      if (!script) {
        script = document.createElement("script");
        script.src =
          "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        script.dataset.creatorsTurnstile = "true";
        document.head.appendChild(script);
      }
      script.addEventListener("load", render);
      script.addEventListener("error", onScriptError);
      if (window.turnstile) render();
    }

    return () => {
      disposed = true;
      script?.removeEventListener("load", render);
      script?.removeEventListener("error", onScriptError);
      if (widgetId) window.turnstile?.remove(widgetId);
    };
  }, [siteKey, action, resetKey]);

  return (
    <div className="space-y-2" aria-label="Human verification">
      <div ref={container} />
      {failed ? (
        <p role="alert" className="text-xs text-destructive">
          Verification is unavailable. Reload the page and try again.
        </p>
      ) : null}
    </div>
  );
}
