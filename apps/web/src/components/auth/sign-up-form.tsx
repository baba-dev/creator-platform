"use client";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

const inputClassName = "form-control mt-2 text-sm";

export function SignUpForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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

    const result = await authClient.signUp.email({
      name: String(form.get("name") ?? "").trim(),
      email: String(form.get("email") ?? "").trim(),
      password,
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

    router.push("/onboarding");
    router.refresh();
  }

  return (
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
        By continuing, you are creating an organization workspace with you as
        its owner. An administrator can assign credits after signup.
      </p>
    </form>
  );
}
