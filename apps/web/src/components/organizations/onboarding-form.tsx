"use client";

import { Button } from "@/components/ui/button";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type OrganizationResponse = {
  error?: string;
  workspacePath?: string;
};

export function OnboardingForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/organizations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: String(form.get("name") ?? "").trim() }),
    });
    const result = (await response.json()) as OrganizationResponse;

    if (result.workspacePath) {
      router.push(result.workspacePath as Route);
      router.refresh();
      return;
    }

    setError(result.error ?? "We could not create the organization.");
    setPending(false);
  }

  return (
    <form className="mt-8" onSubmit={handleSubmit}>
      <label className="block text-xs font-bold text-foreground/90">
        Organization name
        <input
          className="form-control mt-2 text-sm"
          name="name"
          type="text"
          autoComplete="organization"
          minLength={2}
          maxLength={80}
          required
          autoFocus
          placeholder="Company or team name"
        />
      </label>

      {error ? (
        <p
          className="mt-4 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <Button className="mt-5 w-full" size="lg" disabled={pending}>
        {pending ? "Preparing your canvas…" : "Create workspace"}
      </Button>
    </form>
  );
}
