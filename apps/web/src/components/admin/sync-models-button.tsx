"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

export function SyncModelsButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [isSyncing, setIsSyncing] = useState(false);

  async function handleSync() {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/admin/models/sync", {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to sync models");
      }
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Sync failed");
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={pending || isSyncing}
      onClick={() => void handleSync()}
    >
      {pending || isSyncing ? "Syncing..." : "Sync provider models"}
    </Button>
  );
}
