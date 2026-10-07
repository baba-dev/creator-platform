"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import Image from "next/image";

interface Preferences {
  enabled: boolean;
  language: "English" | "Hinglish" | "Arabic";
  responseStyle: "concise" | "detailed";
  aspectRatio: "1:1" | "9:16" | "16:9";
  brandProfileId: string | null;
}
interface Action {
  id: string;
  position: number;
  status: string;
  jobId: string | null;
  payload: {
    kind: string;
    prompt: string;
    aspectRatio: string;
    resolution: string;
    outputCount: number;
    sourceStep?: number;
    sourceOutput?: number;
    sourceAssetId?: string;
    durationSeconds: number;
  };
  assets: Array<{ id: string; mediaKind: string; previewKind?: string | null }>;
  quote: {
    quoteId: string;
    expiresAt: string;
    maximumChargeCredits: string;
    estimatedCredits: string;
    modelName: string;
    sourceAssetId?: string;
  } | null;
}
interface Workflow {
  id: string;
  title: string;
  cancelled: boolean;
  actions: Action[];
}
const defaults: Preferences = {
  enabled: false,
  language: "English",
  responseStyle: "concise",
  aspectRatio: "1:1",
  brandProfileId: null,
};

export function PixelControls({
  threadId,
  refreshKey,
  onNavigate,
  showPreferences,
  onClosePreferences,
}: {
  threadId: string;
  refreshKey: number;
  onNavigate: (route: string) => void;
  showPreferences: boolean;
  onClosePreferences: () => void;
}) {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [preferences, setPreferences] = useState<Preferences>(defaults);
  const [brands, setBrands] = useState<Array<{ id: string; name: string }>>([]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch(
      `/api/assistant/control?threadId=${encodeURIComponent(threadId)}`,
      { cache: "no-store" },
    );
    const data = (await response.json()) as {
      workflows: Workflow[];
      preferences: Preferences;
      brands: Array<{ id: string; name: string }>;
      error?: string;
    };
    if (!response.ok)
      throw new Error(data.error ?? "Could not load Pixel tasks.");
    setWorkflows(data.workflows);
    setPreferences(data.preferences);
    setBrands(data.brands);
  }, [threadId]);

  useEffect(() => {
    void Promise.resolve()
      .then(refresh)
      .catch((error: unknown) =>
        setNotice(
          error instanceof Error ? error.message : "Could not load tasks.",
        ),
      );
  }, [refresh, refreshKey]);
  const hasPending = workflows.some((w) =>
    w.actions.some((a) =>
      [
        "ADMITTING",
        "SUBMITTED",
        "QUEUED",
        "SUBMITTING",
        "RUNNING",
        "PROCESSING",
        "RESERVED",
      ].includes(a.status),
    ),
  );
  useEffect(() => {
    if (!hasPending) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible")
        void refresh().catch(() =>
          setNotice("Task refresh failed. Open History to check saved jobs."),
        );
    }, 5000);
    return () => window.clearInterval(timer);
  }, [hasPending, refresh]);

  async function act(payload: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/assistant/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, ...payload }),
      });
      const data = (await response.json()) as {
        error?: string;
        message?: string;
      };
      if (!response.ok)
        throw new Error(data.error ?? "Could not complete action.");
      setNotice(
        data.message ??
          (payload.operation === "preferences" ? "Preferences updated." : null),
      );
      await refresh();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not complete action.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 text-sm [&_button]:min-h-11 [&_button]:h-auto [&_button]:whitespace-normal [&_button]:py-2">
      {showPreferences && (
        <section
          data-pixel-preferences
          aria-label="Pixel preferences and memory"
          className="rounded-xl border border-border bg-background p-3"
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">Pixel preferences &amp; memory</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Save preferences for this workspace only. Turn memory off to
                forget them.
              </p>
            </div>
            <button
              type="button"
              onClick={onClosePreferences}
              className="min-h-10 shrink-0 rounded-lg px-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Close Pixel preferences"
            >
              Close
            </button>
          </div>
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              checked={preferences.enabled}
              onChange={(e) =>
                setPreferences({ ...preferences, enabled: e.target.checked })
              }
            />
            Remember my choices
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              Language
              <select
                className="min-h-11 rounded-lg border border-border bg-card p-2"
                value={preferences.language}
                onChange={(e) =>
                  setPreferences({
                    ...preferences,
                    language: e.target.value as Preferences["language"],
                  })
                }
              >
                {["English", "Hinglish", "Arabic"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              Response style
              <select
                className="min-h-11 rounded-lg border border-border bg-card p-2"
                value={preferences.responseStyle}
                onChange={(e) =>
                  setPreferences({
                    ...preferences,
                    responseStyle: e.target.value as Preferences["responseStyle"],
                  })
                }
              >
                <option value="concise">Concise</option>
                <option value="detailed">Detailed</option>
              </select>
            </label>
            <label className="grid gap-1">
              Preferred ratio
              <select
                className="min-h-11 rounded-lg border border-border bg-card p-2"
                value={preferences.aspectRatio}
                onChange={(e) =>
                  setPreferences({
                    ...preferences,
                    aspectRatio: e.target.value as Preferences["aspectRatio"],
                  })
                }
              >
                {["1:1", "9:16", "16:9"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              Brand profile
              <select
                className="min-h-11 rounded-lg border border-border bg-card p-2"
                value={preferences.brandProfileId ?? ""}
                onChange={(e) =>
                  setPreferences({
                    ...preferences,
                    brandProfileId: e.target.value || null,
                  })
                }
              >
                <option value="">No brand</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              disabled={busy}
              onClick={() => void act({ operation: "preferences", preferences })}
            >
              Save preferences
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void act({ operation: "preferences", preferences: defaults })
              }
            >
              Forget preferences
            </Button>
          </div>

        </section>
      )}
      {workflows.map((workflow) => (
        <details
          key={workflow.id}
          className="rounded-xl border border-border bg-background p-3"
          open={!workflow.cancelled}
        >
          <summary className="min-h-10 cursor-pointer font-semibold break-words">
            {workflow.title}
            {workflow.cancelled ? " · Stopped" : ""}
          </summary>
          <p className="text-xs text-muted-foreground">
            Review and approve each paid step. Completed outputs stay available
            if a later step fails.
          </p>
          {workflow.actions.map((action) => {
            const source = workflow.actions.find(
              (a) => a.position === action.payload.sourceStep,
            );
            return (
              <div
                key={action.id}
                className="mt-3 space-y-2 border-t border-border pt-3"
              >
                <p className="font-semibold">
                  {action.position}. {action.payload.kind.toLowerCase()} ·{" "}
                  {action.status.toLowerCase().replaceAll("_", " ")}
                </p>
                <p className="whitespace-pre-wrap break-words text-xs">
                  {action.payload.prompt}
                </p>
                <p className="text-xs text-muted-foreground">
                  {action.payload.resolution} · {action.payload.aspectRatio} ·{" "}
                  {action.payload.outputCount} output
                  {action.payload.outputCount === 1 ? "" : "s"}
                  {action.payload.kind === "VIDEO"
                    ? ` · ${action.payload.durationSeconds}s`
                    : ""}
                </p>
                {source && !action.payload.sourceOutput && !action.jobId && (
                  <label className="grid gap-1 text-xs">
                    Source image
                    <select
                      className="min-h-11 rounded-lg border border-border bg-card p-2"
                      value={selected[action.id] ?? ""}
                      disabled={busy || action.status === "ADMITTING"}
                      onChange={(e) => {
                        setSelected({
                          ...selected,
                          [action.id]: e.target.value,
                        });
                        setWorkflows((items) =>
                          items.map((workflow) => ({
                            ...workflow,
                            actions: workflow.actions.map((item) =>
                              item.id === action.id
                                ? { ...item, quote: null, status: "DRAFT" }
                                : item,
                            ),
                          })),
                        );
                      }}
                    >
                      <option value="">
                        Choose an output from step {source.position}
                      </option>
                      {source.assets
                        .filter((asset) => asset.mediaKind === "IMAGE")
                        .map((asset, i) => (
                          <option value={asset.id} key={asset.id}>
                            Image {i + 1} · {asset.id.slice(-8)}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                {action.quote && (
                  <p className="rounded-lg bg-muted p-2 text-xs">
                    {action.quote.modelName}: estimated{" "}
                    {action.quote.estimatedCredits} credits; maximum{" "}
                    {action.quote.maximumChargeCredits} credits. Quote expires{" "}
                    {new Date(action.quote.expiresAt).toLocaleTimeString()}.
                    {action.quote.sourceAssetId && (
                      <>
                        {" "}
                        Quoted source: {action.quote.sourceAssetId.slice(-8)}.
                      </>
                    )}
                  </p>
                )}
                {source && (
                  <div className="flex flex-wrap gap-2">
                    {source.assets
                      .filter((asset) => asset.mediaKind === "IMAGE")
                      .map((asset, index) => (
                        <button
                          key={asset.id}
                          type="button"
                          className="rounded-lg border border-border p-2 text-xs text-primary"
                          onClick={() =>
                            onNavigate(
                              `/image?assetId=${encodeURIComponent(asset.id)}`,
                            )
                          }
                        >
                          {asset.previewKind && (
                            <Image
                              src={`/api/assets/${encodeURIComponent(asset.id)}/variant/${asset.previewKind}`}
                              alt={`Source image ${index + 1}`}
                              width={64}
                              height={64}
                              unoptimized
                              className="rounded-md object-contain"
                            />
                          )}
                          View image {index + 1}
                        </button>
                      ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {!workflow.cancelled &&
                    ["DRAFT", "PREPARED"].includes(action.status) && (
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          void act({
                            operation: "quote",
                            actionId: action.id,
                            selectedSourceId: selected[action.id],
                          })
                        }
                      >
                        Refresh quote
                      </Button>
                    )}
                  {!workflow.cancelled &&
                    action.status === "PREPARED" &&
                    action.quote && (
                      <Button
                        disabled={
                          busy ||
                          Date.parse(action.quote.expiresAt) <= Date.now()
                        }
                        onClick={() =>
                          void act({
                            operation: "execute",
                            actionId: action.id,
                            quoteId: action.quote!.quoteId,
                          })
                        }
                      >
                        Approve up to {action.quote.maximumChargeCredits}{" "}
                        credits
                      </Button>
                    )}
                  {action.status === "ADMITTING" && action.quote && (
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void act({
                          operation: "execute",
                          actionId: action.id,
                          quoteId: action.quote!.quoteId,
                        })
                      }
                    >
                      Recover approved step
                    </Button>
                  )}
                  {action.jobId && (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        onNavigate(
                          `/history/${encodeURIComponent(action.jobId!)}`,
                        )
                      }
                    >
                      View job
                    </Button>
                  )}
                  {action.assets.map((asset, i) => (
                    <Button
                      key={asset.id}
                      variant="secondary"
                      onClick={() =>
                        onNavigate(
                          `/${asset.mediaKind === "VIDEO" ? "video" : "image"}?assetId=${encodeURIComponent(asset.id)}`,
                        )
                      }
                    >
                      Open output {i + 1}
                    </Button>
                  ))}
                </div>
              </div>
            );
          })}
          {!workflow.cancelled && (
            <Button
              className="mt-3"
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void act({ operation: "cancel", workflowId: workflow.id })
              }
            >
              Stop future steps
            </Button>
          )}
        </details>
      ))}
      {notice && (
        <p
          role="status"
          className="rounded-lg border border-border bg-muted p-3 text-xs"
        >
          {notice}
        </p>
      )}
    </div>
  );
}
