"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

export function StartConversationButton({
  organizationId, organizationSlug,
}: {
  organizationId: string;
  organizationSlug: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/conversations/blank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });
      const result = (await res.json()) as {
        conversationId?: string;
        title?: string;
        error?: string;
      };
      if (!res.ok || !result.conversationId) {
        throw new Error(result.error ?? "Could not start conversation.");
      }
      window.dispatchEvent(
        new CustomEvent("aiwa:conversation-started", {
          detail: {
            id: result.conversationId,
            title: result.title ?? "New conversation",
            threadType: "CREATIVE",
            updatedAt: new Date().toISOString(),
          },
        }),
      );
      router.push(
        `/app/${encodeURIComponent(organizationSlug)}/conversations/${encodeURIComponent(result.conversationId)}` as Route,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Connection unavailable.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="secondary"
        disabled={busy}
        aria-busy={busy}
        onClick={() => void start()}
      >
        <Icon name="chat" className="size-4" />
        {busy ? "Opening…" : "Start conversation"}
      </Button>
      {error ? <p className="max-w-64 text-xs text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}
