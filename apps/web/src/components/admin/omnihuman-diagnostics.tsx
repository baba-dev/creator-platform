"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function OmniHumanDiagnostics() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function verify() {
    setPending(true);
    try {
      const response = await fetch("/api/admin/models/omnihuman-diagnostics", {
        method: "POST",
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error("OmniHuman diagnostics could not be loaded.");
      setMessage(
        `${result.diagnostics.message}${result.diagnostics.code ? ` (${result.diagnostics.code})` : ""}`,
      );
    } catch {
      setMessage(
        "OmniHuman diagnostics could not be loaded. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="max-w-md space-y-2">
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() => void verify()}
      >
        {pending ? "Checking OmniHuman…" : "Verify OmniHuman connection"}
      </Button>
      <p role="status" className="text-xs text-muted-foreground">
        {message || "Read-only credentials check; no generation is submitted."}
      </p>
    </div>
  );
}
