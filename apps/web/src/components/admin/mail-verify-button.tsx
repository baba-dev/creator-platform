"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function MailVerifyButton() {
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "checking" }
    | { status: "ok" }
    | { status: "error"; code: string }
  >({ status: "idle" });

  async function verify() {
    setState({ status: "checking" });
    try {
      const response = await fetch("/api/admin/email/verify", {
        method: "POST",
      });
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean;
        code?: string;
      } | null;

      if (response.ok && body?.ok) {
        setState({ status: "ok" });
        return;
      }
      setState({
        status: "error",
        code: body?.code ?? "SMTP_VERIFY_FAILED",
      });
    } catch {
      setState({ status: "error", code: "NETWORK_ERROR" });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={state.status === "checking"}
        onClick={() => void verify()}
      >
        {state.status === "checking" ? "Checking SMTP…" : "Verify SMTP"}
      </Button>
      {state.status === "ok" ? (
        <span className="text-xs font-medium text-success">
          SMTP TLS and authentication verified.
        </span>
      ) : state.status === "error" ? (
        <span className="font-mono text-[10px] text-destructive">
          {state.code}
        </span>
      ) : null}
    </div>
  );
}
