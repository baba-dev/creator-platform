"use client";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import type { Route } from "next";
import Link from "next/link";
import { useState, type FormEvent } from "react";

const inputClassName = "form-control mt-2 text-sm";

export function ForgotPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const emailValue = String(form.get("email") ?? "").trim();
    setEmail(emailValue);

    const result = await authClient.requestPasswordReset({
      email: emailValue,
      redirectTo: "/reset-password",
    });

    setPending(false);

    if (result.error) {
      setError(result.error.message ?? "Could not send password reset email.");
      return;
    }

    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="space-y-5">
        <div
          role="status"
          className="rounded-xl border border-success/30 bg-success/10 p-4 text-sm space-y-2"
        >
          <div className="font-semibold text-foreground">Check your inbox</div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            If an account exists for{" "}
            <strong className="text-foreground">{email}</strong>, we have sent
            instructions to reset your password. The link expires in 1 hour.
          </p>
        </div>

        <div className="space-y-3 pt-2">
          <Button
            className="w-full"
            variant="secondary"
            size="sm"
            type="button"
            onClick={() => {
              setSubmitted(false);
              setError(null);
            }}
          >
            Resend or try another email
          </Button>

          <Button className="w-full" variant="ghost" size="sm" asChild>
            <Link href={"/sign-in" as Route}>Back to sign in</Link>
          </Button>
        </div>
      </div>
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
          defaultValue={email}
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
        {pending ? "Sending link…" : "Send reset link"}
      </Button>

      <div className="text-center">
        <Link
          href={"/sign-in" as Route}
          className="text-xs font-semibold text-muted-foreground hover:text-foreground underline"
        >
          Back to sign in
        </Link>
      </div>
    </form>
  );
}
