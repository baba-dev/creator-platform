"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

type ToolKey = "matting" | "quality" | "smoothness";

interface ToolAvailability {
  key: ToolKey;
  providerToolId: string;
  available: boolean;
  enabled: boolean;
  repairAllowed: boolean;
  priceVersionId?: string;
  estimatedCredits?: string;
  detectionOnlyCredits?: string | null;
  reason?: string | null;
}

interface ToolCatalogResponse {
  asset: { id: string; durationMs: number; mimeType: string };
  tools: ToolAvailability[];
  error?: string;
}

interface ExecutionResponse {
  execution?: {
    id: string;
    status: string;
    reservedCredits?: string;
    chargedCredits?: string;
    errorMessage?: string | null;
    vqScore?: number | null;
    outputAssetId?: string | null;
  };
  error?: string;
}

const TERMINAL = new Set([
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "MANUAL_REVIEW",
]);

export function SpokespersonMediaKitTools({
  organizationId,
  assetId,
  canGenerate,
  onOutputAsset,
}: {
  organizationId: string;
  assetId: string;
  canGenerate: boolean;
  onOutputAsset: (assetId: string) => void;
}) {
  const [catalog, setCatalog] = useState<ToolCatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<ToolKey | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [qualityScore, setQualityScore] = useState<number | null>(null);
  const [mattingFormat, setMattingFormat] = useState<"WEBM" | "MP4">("WEBM");
  const [backgroundColor, setBackgroundColor] = useState<
    "black" | "white" | "green"
  >("green");

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setMessage(null);
    setQualityScore(null);
    void fetch(
      `/api/spokesperson/tools?organizationId=${encodeURIComponent(
        organizationId,
      )}&assetId=${encodeURIComponent(assetId)}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as ToolCatalogResponse;
        if (!response.ok) throw new Error(body.error ?? "MediaKit tools are unavailable.");
        return body;
      })
      .then((body) => {
        if (active) setCatalog(body);
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted) return;
        setCatalog(null);
        setMessage(error instanceof Error ? error.message : "MediaKit tools are unavailable.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [organizationId, assetId]);

  const tools = useMemo(
    () =>
      new Map<ToolKey, ToolAvailability>(
        (catalog?.tools ?? []).map((tool) => [tool.key, tool]),
      ),
    [catalog?.tools],
  );

  async function pollExecution(executionId: string, tool: ToolKey) {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      const response = await fetch(
        `/api/spokesperson/tools/${encodeURIComponent(executionId)}`,
        { cache: "no-store" },
      );
      const body = (await response.json().catch(() => ({}))) as ExecutionResponse;
      if (!response.ok || !body.execution) {
        throw new Error(body.error ?? "Unable to read MediaKit status.");
      }
      if (!TERMINAL.has(body.execution.status)) continue;

      if (body.execution.status !== "SUCCEEDED") {
        throw new Error(
          body.execution.errorMessage ??
            "MediaKit processing needs operator review.",
        );
      }

      if (tool === "quality" && body.execution.vqScore !== null && body.execution.vqScore !== undefined) {
        setQualityScore(body.execution.vqScore);
        const band =
          body.execution.vqScore >= 70
            ? "excellent"
            : body.execution.vqScore >= 60
              ? "good"
              : "needs improvement";
        setMessage(
          `VQScore ${body.execution.vqScore.toFixed(1)} / 100 — ${band}. Charged ${body.execution.chargedCredits ?? "0"} credits.`,
        );
      } else if (body.execution.outputAssetId) {
        onOutputAsset(body.execution.outputAssetId);
        setMessage(
          `${tool === "smoothness" ? "Smoothness enhancement" : "Portrait matting"} completed. Charged ${body.execution.chargedCredits ?? "0"} credits.`,
        );
      } else if (tool === "smoothness") {
        setMessage(
          `No repair was needed. Detection-only pricing applied: ${body.execution.chargedCredits ?? "0"} credits.`,
        );
      } else {
        setMessage("MediaKit processing completed.");
      }
      return;
    }
    throw new Error(
      "MediaKit is still processing. The durable job will continue in the worker.",
    );
  }

  async function run(tool: ToolKey) {
    if (!canGenerate || running) return;
    const availability = tools.get(tool);
    if (!availability?.available) {
      setMessage(availability?.reason ?? "This MediaKit tool is unavailable.");
      return;
    }
    setRunning(tool);
    setMessage(null);
    if (tool === "quality") setQualityScore(null);
    try {
      const response = await fetch("/api/spokesperson/tools", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organizationId,
          assetId,
          tool,
          idempotencyKey: crypto.randomUUID(),
          ...(tool === "matting"
            ? {
                mattingFormat,
                ...(mattingFormat === "MP4" ? { backgroundColor } : {}),
              }
            : {}),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as ExecutionResponse;
      if (!response.ok || !body.execution?.id) {
        throw new Error(body.error ?? "Unable to start MediaKit processing.");
      }
      setMessage(
        `${tool === "quality" ? "Assessing video quality" : tool === "smoothness" ? "Detecting and repairing stutter" : "Removing portrait background"}…`,
      );
      await pollExecution(body.execution.id, tool);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "MediaKit processing failed.",
      );
    } finally {
      setRunning(null);
    }
  }

  const matting = tools.get("matting");
  const quality = tools.get("quality");
  const smoothness = tools.get("smoothness");

  return (
    <section className="space-y-4 rounded-3xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">
            OmniHuman finishing tools
          </p>
          <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
            Run BytePlus MediaKit directly on this OmniHuman render. Source media
            stays private and is exposed to the provider only through a
            short-lived execution-bound URL.
          </p>
        </div>
        {catalog?.asset ? (
          <span className="rounded-full bg-muted px-2.5 py-1 font-mono text-[10px] text-muted-foreground">
            {(catalog.asset.durationMs / 1000).toFixed(1)}s
          </span>
        ) : null}
      </div>

      {message ? (
        <div
          role="status"
          className="rounded-xl border border-border bg-surface-sunken px-3 py-2 text-xs text-foreground"
        >
          {message}
        </div>
      ) : null}

      {qualityScore !== null ? (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                VQScore
              </p>
              <p className="mt-1 font-mono text-3xl font-bold tabular-nums">
                {qualityScore.toFixed(1)}
                <span className="ml-1 text-sm font-medium text-muted-foreground">
                  / 100
                </span>
              </p>
            </div>
            <span className="text-xs font-semibold">
              {qualityScore >= 70
                ? "Excellent"
                : qualityScore >= 60
                  ? "Good"
                  : "Needs improvement"}
            </span>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-border p-4">
          <div className="flex items-center gap-2">
            <Icon name="image" className="size-4 text-primary" />
            <p className="text-sm font-semibold">Portrait matting</p>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Remove the background. WebM preserves transparency; MP4 uses a solid
            background.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <select
              aria-label="Matting output format"
              value={mattingFormat}
              onChange={(event) =>
                setMattingFormat(event.target.value as "WEBM" | "MP4")
              }
              className="h-9 rounded-lg border border-input bg-background px-2 text-xs"
            >
              <option value="WEBM">WebM alpha</option>
              <option value="MP4">MP4</option>
            </select>
            {mattingFormat === "MP4" ? (
              <select
                aria-label="Matting background color"
                value={backgroundColor}
                onChange={(event) =>
                  setBackgroundColor(
                    event.target.value as "black" | "white" | "green",
                  )
                }
                className="h-9 rounded-lg border border-input bg-background px-2 text-xs"
              >
                <option value="green">Green</option>
                <option value="black">Black</option>
                <option value="white">White</option>
              </select>
            ) : (
              <div className="flex h-9 items-center rounded-lg bg-muted px-2 text-[10px] text-muted-foreground">
                Transparent
              </div>
            )}
          </div>
          <Button
            className="mt-3 w-full"
            size="sm"
            variant="secondary"
            disabled={loading || running !== null || !canGenerate || !matting?.available}
            onClick={() => void run("matting")}
          >
            {running === "matting" ? "Matting…" : "Remove background"}
          </Button>
          <p className="mt-2 text-[10px] text-muted-foreground">
            {matting?.estimatedCredits
              ? `Up to ${matting.estimatedCredits} credits`
              : matting?.reason ?? "Loading price…"}
          </p>
        </div>

        <div className="rounded-2xl border border-border p-4">
          <div className="flex items-center gap-2">
            <Icon name="activity" className="size-4 text-primary" />
            <p className="text-sm font-semibold">Quality assessment</p>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Measure perceptual quality with MediaKit VQScore before publishing.
          </p>
          <Button
            className="mt-12 w-full"
            size="sm"
            variant="secondary"
            disabled={loading || running !== null || !canGenerate || !quality?.available}
            onClick={() => void run("quality")}
          >
            {running === "quality" ? "Assessing…" : "Assess quality"}
          </Button>
          <p className="mt-2 text-[10px] text-muted-foreground">
            {quality?.estimatedCredits
              ? `${quality.estimatedCredits} credits`
              : quality?.reason ?? "Loading price…"}
          </p>
        </div>

        <div className="rounded-2xl border border-border p-4">
          <div className="flex items-center gap-2">
            <Icon name="wand" className="size-4 text-primary" />
            <p className="text-sm font-semibold">Smooth motion</p>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Detect duplicate frames and periodic stutter, repairing only when
            needed while preserving the source FPS.
          </p>
          <Button
            className="mt-7 w-full"
            size="sm"
            variant="secondary"
            disabled={
              loading ||
              running !== null ||
              !canGenerate ||
              !smoothness?.available
            }
            onClick={() => void run("smoothness")}
          >
            {running === "smoothness" ? "Enhancing…" : "Enhance smoothness"}
          </Button>
          <p className="mt-2 text-[10px] text-muted-foreground">
            {smoothness?.estimatedCredits
              ? `Up to ${smoothness.estimatedCredits} credits; ${smoothness.detectionOnlyCredits ?? "—"} if no repair is needed`
              : smoothness?.reason ?? "Loading price…"}
          </p>
        </div>
      </div>
    </section>
  );
}
