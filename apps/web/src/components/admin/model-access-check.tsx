"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

type Result = {
  status?: string;
  code?: string;
  requestedModel?: { available?: boolean };
};
/** An explicit admin action; never performs billable inference or stores credentials in the browser. */
export function ModelAccessCheck({
  provider,
  modelId,
}: {
  provider: "GEMINI" | "NVIDIA";
  modelId: string;
}) {
  const [result, setResult] = useState<Result | null>(null);
  const [pending, setPending] = useState(false);
  async function check() {
    if (pending) return;
    setPending(true);
    setResult(null);
    try {
      const endpoint =
        provider === "GEMINI" ? "gemini-diagnostics" : "nvidia-diagnostics";
      const response = await fetch(
        `/api/admin/models/${endpoint}?modelId=${encodeURIComponent(modelId)}`,
        { cache: "no-store" },
      );
      const body = (await response.json()) as Result;
      setResult(response.ok ? body : { status: "inconclusive" });
    } catch {
      setResult({ status: "inconclusive" });
    } finally {
      setPending(false);
    }
  }
  const available = result?.requestedModel?.available;
  return (
    <div className="mt-2 max-w-64 space-y-1.5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={check}
        className="min-h-10 gap-1.5 text-xs"
      >
        <Icon name="shield" className="size-4" />{" "}
        {pending ? "Checking listing…" : "Check model listing"}
      </Button>
      {result ? (
        <p
          role="status"
          className={`rounded-lg border border-border bg-surface-sunken p-2 text-[11px] leading-4 ${available === false ? "text-warning" : "text-muted-foreground"}`}
        >
          {result.status === "missing_credentials"
            ? "Provider key is missing on the web runtime."
            : available === true
              ? "Model appears in the provider listing. Invocation and commercial rights still require separate verification."
              : available === false
                ? "Not present in the provider listing for this key. Do not enable without investigating."
                : "Listing could not be verified. Check endpoint/network and credentials; this does not indicate a successful inference."}
          {result.code ? (
            <span className="mt-1 block font-mono">Code: {result.code}</span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
