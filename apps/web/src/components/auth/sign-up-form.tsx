"use client";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { SocialAuthButtons } from "./social-auth-buttons";
import type { Route } from "next";
import Link from "next/link";
import { useState, type FormEvent } from "react";

const inputClassName = "form-control mt-2 text-sm";

export function SignUpForm({
  returnTo,
  googleEnabled = false,
  microsoftEnabled = false,
}: {
  returnTo?: Route;
  googleEnabled?: boolean;
  microsoftEnabled?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  const isInvite = Boolean(returnTo && returnTo.startsWith("/invite/"));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("passwordConfirmation") ?? "");

    if (password !== confirmation) {
      setError("Passwords do not match.");
      setPending(false);
      return;
    }

    const email = String(form.get("email") ?? "").trim();
    const result = await authClient.signUp.email({
      name: String(form.get("name") ?? "").trim(),
      email,
      password,
      callbackURL: returnTo ?? "/onboarding",
    });

    if (result.error) {
      setError(
        result.error.status === 429
          ? "Too many signup attempts. Please try again shortly."
          : "We could not create the account. Check the details and try again.",
      );
      setPending(false);
      return;
    }

    setVerificationEmail(email);
    setPending(false);
  }

  if (verificationEmail) {
    const signInHref =
      returnTo && returnTo !== "/onboarding"
        ? (`/sign-in?returnTo=${encodeURIComponent(returnTo)}` as Route)
        : ("/sign-in" as Route);

    return (
      <div className="space-y-4">
        <p className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          Your account has been created for <strong>{verificationEmail}</strong>
          .
        </p>
        <p className="text-xs leading-5 text-muted-foreground">
          {isInvite
            ? "Your account is ready. Check your inbox for the verification link; request a new one if delivery is delayed. Your invitation remains available."
            : "Verification delivery happens separately from account creation. Check your inbox or request another link, then continue to onboarding."}
        </p>
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          disabled={resending}
          onClick={async () => {
            setResending(true);
            try {
              const result = await authClient.sendVerificationEmail({
                email: verificationEmail,
                callbackURL: returnTo ?? "/onboarding",
              });
              setResendStatus(
                result.error
                  ? "Unable to request another link yet. Please try later."
                  : "A fresh verification email has been requested.",
              );
            } catch {
              setResendStatus("Unable to request a link right now.");
            } finally {
              setResending(false);
            }
          }}
        >
          {resending ? "Requesting…" : "Resend verification link"}
        </Button>
        {resendStatus ? (
          <p role="status" className="text-xs text-muted-foreground">
            {resendStatus}
          </p>
        ) : null}
        <Button asChild className="w-full">
          <Link href={signInHref}>Continue to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SocialAuthButtons
        googleEnabled={googleEnabled}
        microsoftEnabled={microsoftEnabled}
        callbackURL={returnTo ?? "/onboarding"}
      />
      <form className="space-y-5" onSubmit={handleSubmit}>
        <label className="block text-xs font-bold text-foreground/90">
          Your name
          <input
            className={inputClassName}
            name="name"
            type="text"
            autoComplete="name"
            minLength={2}
            maxLength={80}
            required
            autoFocus
            placeholder="Full name"
          />
        </label>

        <label className="block text-xs font-bold text-foreground/90">
          Work email
          <input
            className={inputClassName}
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            placeholder="you@company.com"
          />
        </label>

        <label className="block text-xs font-bold text-foreground/90">
          Password
          <input
            className={inputClassName}
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
            placeholder="At least 12 characters"
          />
        </label>

        <label className="block text-xs font-bold text-foreground/90">
          Confirm password
          <input
            className={inputClassName}
            name="passwordConfirmation"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
            placeholder="Repeat your password"
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
          {pending ? "Creating account…" : "Create account"}
        </Button>

        <p className="text-xs leading-5 text-muted-foreground">
          {isInvite
            ? "Workspace access begins after you verify ownership of this email address."
            : "Workspace creation begins only after you verify ownership of this email address. An administrator can assign credits after signup."}
        </p>
      </form>
    </div>
  );
}
