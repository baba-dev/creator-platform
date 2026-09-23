"use client";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type SignInFormProps = {
  returnTo: Route;
};

const inputClassName = "form-control mt-2 text-sm";

export function SignInForm({ returnTo }: SignInFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [totpCode, setTotpCode] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const result = await authClient.signIn.email({
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
      rememberMe: true,
    });

    if (result.error) {
      setError("We could not sign you in with those details.");
      setPending(false);
      return;
    }

    if ((result.data as { twoFactorRedirect?: boolean })?.twoFactorRedirect) {
      setRequires2FA(true);
      setPending(false);
      return;
    }

    router.push(returnTo);
    router.refresh();
  }

  async function handle2FASubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const code = totpCode.trim();
    const result = await authClient.twoFactor.verifyTotp({
      code,
    });

    if (result.error) {
      const backupResult = await authClient.twoFactor.verifyBackupCode({
        code,
      });
      if (backupResult.error) {
        setError("Invalid authentication code. Please check and try again.");
        setPending(false);
        return;
      }
    }

    router.push(returnTo);
    router.refresh();
  }

  if (requires2FA) {
    return (
      <form className="space-y-5" onSubmit={handle2FASubmit}>
        <div>
          <h2 className="text-sm font-semibold">Two-factor authentication</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Enter the 6-digit verification code from your authenticator app (or
            a backup code).
          </p>
        </div>

        <label className="block text-xs font-bold text-foreground/90">
          Verification code
          <input
            className={inputClassName}
            name="totpCode"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            autoFocus
            placeholder="123456"
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value)}
          />
        </label>

        {error ? (
          <p
            className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <Button className="w-full" size="lg" disabled={pending} type="submit">
          {pending ? "Verifying…" : "Verify code"}
        </Button>

        <Button
          className="w-full"
          variant="secondary"
          size="sm"
          type="button"
          onClick={() => {
            setRequires2FA(false);
            setError(null);
            setTotpCode("");
          }}
        >
          Back to sign in
        </Button>
      </form>
    );
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <label className="block text-xs font-bold text-foreground/90">
        Work email
        <input
          className={inputClassName}
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          autoFocus
          placeholder="you@company.com"
        />
      </label>

      <label className="block text-xs font-bold text-foreground/90">
        Password
        <input
          className={inputClassName}
          name="password"
          type="password"
          autoComplete="current-password"
          minLength={12}
          maxLength={128}
          required
          placeholder="Your password"
        />
      </label>

      {error ? (
        <p
          className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <Button className="w-full" size="lg" disabled={pending} type="submit">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
