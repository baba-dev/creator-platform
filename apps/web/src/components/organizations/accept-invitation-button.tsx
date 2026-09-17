"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function AcceptInvitationButton({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setError(null);
    try {
      const res = await fetch(`/api/invitations/${token}/accept`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as {
        organizationSlug?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to accept invitation.");
      }
      startTransition(() => {
        router.push(
          data.organizationSlug ? `/app/${data.organizationSlug}` : "/app",
        );
      });
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to accept invitation.",
      );
    }
  }

  return (
    <div>
      {error ? (
        <p
          role="status"
          className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs font-semibold text-destructive"
        >
          {error}
        </p>
      ) : null}
      <Button
        onClick={handleAccept}
        disabled={pending}
        className="min-h-11 w-full text-sm font-semibold"
      >
        {pending ? "Joining workspace…" : "Accept invitation & join workspace"}
      </Button>
    </div>
  );
}
