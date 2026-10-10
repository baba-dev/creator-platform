"use client";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export type SocialProvider = "google" | "microsoft";

function ProviderMark({ provider }: { provider: SocialProvider }) {
  return provider === "google" ? (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M21.35 12.23c0-.65-.06-1.28-.17-1.9H12v3.6h5.25a4.5 4.5 0 0 1-1.95 2.95v2.45h3.15c1.84-1.7 2.9-4.2 2.9-7.1Z"
      />
      <path
        fill="#34A853"
        d="M12 21.5c2.62 0 4.82-.87 6.43-2.36l-3.15-2.45c-.87.59-1.99.94-3.28.94-2.52 0-4.66-1.7-5.42-3.99H3.33v2.52A9.72 9.72 0 0 0 12 21.5Z"
      />
      <path
        fill="#FBBC05"
        d="M6.58 13.64a5.84 5.84 0 0 1 0-3.28V7.84H3.33a9.72 9.72 0 0 0 0 8.32l3.25-2.52Z"
      />
      <path
        fill="#EA4335"
        d="M12 6.37c1.43 0 2.72.5 3.73 1.46l2.79-2.79A9.34 9.34 0 0 0 12 2.5a9.72 9.72 0 0 0-8.67 5.34l3.25 2.52c.76-2.29 2.9-3.99 5.42-3.99Z"
      />
    </svg>
  ) : (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24">
      <path fill="#f25022" d="M1 1h10v10H1z" />
      <path fill="#7fba00" d="M13 1h10v10H13z" />
      <path fill="#00a4ef" d="M1 13h10v10H1z" />
      <path fill="#ffb900" d="M13 13h10v10H13z" />
    </svg>
  );
}

export { ProviderMark };

export function SocialAuthButtons({
  googleEnabled,
  microsoftEnabled,
  callbackURL,
  mode = "sign-in",
}: {
  googleEnabled: boolean;
  microsoftEnabled: boolean;
  callbackURL: string;
  mode?: "sign-in" | "link";
}) {
  const [busy, setBusy] = useState<SocialProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function run(provider: SocialProvider) {
    setBusy(provider);
    setError(null);
    try {
      const result =
        mode === "link"
          ? await authClient.linkSocial({ provider, callbackURL })
          : await authClient.signIn.social({ provider, callbackURL: `/pending-verification?returnTo=${encodeURIComponent(callbackURL)}`, errorCallbackURL: "/sign-in?error=account_not_linked" });
      if (result.error) throw new Error("provider_error");
    } catch {
      setError(
        "The provider could not be reached. Please try again or use another sign-in method.",
      );
      setBusy(null);
    }
  }
  if (!googleEnabled && !microsoftEnabled) return null;
  return (
    <div className="space-y-3">
      {(
        [
          ["google", googleEnabled],
          ["microsoft", microsoftEnabled],
        ] as const
      )
        .filter(([, enabled]) => enabled)
        .map(([provider]) => (
          <Button
            key={provider}
            variant="secondary"
            type="button"
            size="lg"
            className="w-full gap-3"
            disabled={busy !== null}
            onClick={() => void run(provider)}
          >
            <ProviderMark provider={provider} />
            {busy === provider
              ? "Connecting…"
              : `${mode === "link" ? "Connect" : "Continue with"} ${provider === "google" ? "Google" : "Microsoft"}`}
          </Button>
        ))}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {mode === "sign-in" ? (
        <div className="flex items-center gap-3 py-2 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          <span>or use email</span>
          <span className="h-px flex-1 bg-border" />
        </div>
      ) : null}
    </div>
  );
}
