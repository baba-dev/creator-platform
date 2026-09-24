"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function MailRetryButton({ mailId }: { mailId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function retry() {
    setBusy(true);
    try {
      const response = await fetch(
        `/api/admin/email/${encodeURIComponent(mailId)}/retry`,
        {
          method: "POST",
        },
      );
      if (response.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={busy}
      onClick={() => void retry()}
    >
      {busy ? "Requeueing…" : "Requeue"}
    </Button>
  );
}
