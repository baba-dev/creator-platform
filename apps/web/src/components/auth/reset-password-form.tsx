"use client";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import type { Route } from "next";
import Link from "next/link";
import { useState, type FormEvent } from "react";

const inputClassName = "form-control mt-2 text-sm";

export function ResetPasswordForm({
  token,
  initialError,
}: {
  token?: string;
  initialError?: string;
}) {
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isTokenInvalid, setIsTokenInvalid] = useState(
    !token || Boolean(initialError),
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      setIsTokenInvalid(true);
      return;
    }

    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");

    if (password.length < 12) {
      setError("Password must be at least 12 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setPending(true);
    setError(null);

    const result = await authClient.resetPassword({
      newPassword: password,
      token,
    });

    setPending(false);

    if (result.error) {
      const msg = result.error.message || "Failed to reset password.";
      if (
        result.error.status === 400 ||
        msg.toLowerCase().includes("token") ||
        msg.toLowerCase().includes("expired") ||
        msg.toLowerCase().includes("invalid")
      ) {
        setIsTokenInvalid(true);
      }
      setError(msg);
      return;
    }

    setSuccess(true);
  }

  if (success) {
    return (
      <div className="space-y-5">
        <div
          role="status"
          className="rounded-xl border border-success/30 bg-success/10 p-4 text-sm space-y-2"
        >
          <div className="font-semibold text-foreground">
            Password updated successfully
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Your password has been changed. You can now sign in with your new
            credentials.
          </p>
        </div>

        <Button className="w-full" size="lg" asChild>
          <Link href={"/sign-in" as Route}>Sign in now</Link>
        </Button>
      </div>
    );
  }

  if (isTokenInvalid) {
    return (
      <div className="space-y-5">
        <div
          role="alert"
          className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm space-y-2"
        >
          <div className="font-semibold text-destructive">
            Reset link expired or invalid
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            This password recovery link has already been used or has expired.
            Password reset links are valid for 1 hour.
          </p>
        </div>

        <Button className="w-full" size="lg" asChild>
          <Link href={"/forgot-password" as Route}>
            Request a new reset link
          </Link>
        </Button>

        <div className="text-center">
          <Link
            href={"/sign-in" as Route}
            className="text-xs font-semibold text-muted-foreground hover:text-foreground underline"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <label className="block text-xs font-bold text-foreground/90">
        New password
        <input
          className={inputClassName}
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
          autoFocus
          placeholder="At least 12 characters"
        />
      </label>

      <label className="block text-xs font-bold text-foreground/90">
        Confirm new password
        <input
          className={inputClassName}
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
          placeholder="Repeat new password"
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
        {pending ? "Updating password…" : "Reset password"}
      </Button>

      <div className="text-center">
        <Link
          href={"/sign-in" as Route}
          className="text-xs font-semibold text-muted-foreground hover:text-foreground underline"
        >
          Cancel and return to sign in
        </Link>
      </div>
    </form>
  );
}
