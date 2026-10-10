"use client";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { SocialAuthButtons } from "./social-auth-buttons";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type SignInFormProps = {
  returnTo: Route;
};

const inputClassName = "form-control mt-2 text-sm";

export function SignInForm({
  returnTo,
  googleEnabled = false,
  microsoftEnabled = false,
}: SignInFormProps & { googleEnabled?: boolean; microsoftEnabled?: boolean }) {
  const router = useRouter();
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  async function signInWithPasskey() {
    setPasskeyBusy(true);
    setError(null);
    try {
      const result = await authClient.signIn.passkey({});
      if (result.error) throw new Error("passkey_failed");
      router.push(returnTo);
      router.refresh();
    } catch {
      setError(
        "Passkey sign-in was cancelled or unavailable. Use another sign-in method.",
      );
    } finally {
      setPasskeyBusy(false);
    }
  }
  const [error, setError] = useState<string | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [resendBusy, setResendBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [totpCode, setTotpCode] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const result = await authClient.signIn.email({
      email,
      password: String(form.get("password") ?? ""),
      rememberMe: true,
    });

    if (result.error) {
      setUnverifiedEmail(result.error.status === 403 ? email : null);
      setError(
        result.error.status === 403
          ? "Please verify your email address before signing in. You can request another link below."
          : "We could not sign you in with those details.",
      );
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
    <div className="space-y-5">
      <SocialAuthButtons
        googleEnabled={googleEnabled}
        microsoftEnabled={microsoftEnabled}
        callbackURL={returnTo}
      />
      <Button
        type="button"
        variant="secondary"
        size="lg"
        className="w-full gap-2"
        disabled={passkeyBusy}
        onClick={() => void signInWithPasskey()}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        >
          <path d="M12 11a3 3 0 0 0-3 3v3m6 0v-3a3 3 0 0 0-6 0m9 3v-3a6 6 0 0 0-12 0v2m6 1v2m-4-1v1m8-2v2M12 2c5 0 9 4 9 9M3 11c0-5 4-9 9-9" />
        </svg>
        {passkeyBusy ? "Verifying device…" : "Sign in with a passkey"}
      </Button>
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

        <div>
          <div className="flex items-center justify-between">
            <label
              htmlFor="sign-in-password"
              className="block text-xs font-bold text-foreground/90"
            >
              Password
            </label>
            <Link
              href={"/forgot-password" as Route}
              className="text-xs font-semibold text-primary hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <input
            id="sign-in-password"
            className={inputClassName}
            name="password"
            type="password"
            autoComplete="current-password"
            minLength={12}
            maxLength={128}
            required
            placeholder="Your password"
          />
        </div>

        {error ? (
          <p
            className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {unverifiedEmail ? (
          <div className="space-y-2 rounded-xl border border-border p-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-full"
              disabled={resendBusy}
              onClick={async () => {
                setResendBusy(true);
                try {
                  const result = await authClient.sendVerificationEmail({
                    email: unverifiedEmail,
                    callbackURL: returnTo,
                  });
                  setResendStatus(
                    result.error
                      ? "Unable to request a new link yet. Please try later."
                      : "A new verification message was requested.",
                  );
                } catch {
                  setResendStatus(
                    "Verification delivery is currently unavailable.",
                  );
                } finally {
                  setResendBusy(false);
                }
              }}
            >
              {resendBusy ? "Requesting…" : "Resend verification link"}
            </Button>
            {resendStatus ? (
              <p role="status" className="text-xs text-muted-foreground">
                {resendStatus}
              </p>
            ) : null}
          </div>
        ) : null}
        <Button className="w-full" size="lg" disabled={pending} type="submit">
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
