"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { mediaToolSourceIssue } from "@aiwa/generation/media-tool-input";
import { Button } from "@/components/ui/button";
import { CreativeSurface, Eyebrow, Annotation } from "@/components/ui/creative";
import { Icon } from "@/components/ui/icon";
import { ProcessFeedback } from "@/components/process/process-feedback";
import { MediaKitArt } from "./mediakit-art";
import {
  AssetButton,
  AssetPicker,
  LayoutPreview,
  MediaKitControls,
  MediaKitDialog,
  MediaPreview,
} from "./mediakit-controls";
import { MediaKitResult } from "./mediakit-result";
import {
  activeStatuses,
  assetDetail,
  defaultSettings,
  mediaInput,
  presetCrop,
  sourceKind,
  toolGroup,
  type Crop,
  type MediaAsset,
  type MediaExecution,
  type MediaTool,
  type Settings,
} from "./mediakit-model";

type Quote = {
  priceVersionId: string;
  reservedCredits: string;
  quotedQuantity: number;
};
class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
async function jsonRequest(url: string, body?: unknown) {
  const response = await fetch(
    url,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30_000),
        }
      : { cache: "no-store", signal: AbortSignal.timeout(30_000) },
  );
  const payload = await response.json();
  if (!response.ok)
    throw new RequestError(
      payload.error ?? "MediaKit request failed.",
      response.status,
    );
  return payload;
}
export function MediaKitStudio({
  organizationId,
  organizationSlug,
  canGenerate,
}: {
  organizationId: string;
  organizationSlug: string;
  canGenerate: boolean;
}) {
  const [tools, setTools] = useState<MediaTool[]>([]),
    [assets, setAssets] = useState<MediaAsset[]>([]),
    [history, setHistory] = useState<MediaExecution[]>([]);
  const [toolKey, setToolKey] = useState("compress-image"),
    [group, setGroup] = useState("Image");
  const [sourceId, setSourceId] = useState(""),
    [audioId, setAudioId] = useState(""),
    [logoId, setLogoId] = useState("");
  const [settings, setSettings] = useState<Settings>({ ...defaultSettings }),
    [crop, setCrop] = useState<Crop>({ x: 0, y: 0, width: 1, height: 1 });
  const [quote, setQuote] = useState<Quote | null>(null),
    [quoteOpen, setQuoteOpen] = useState(false),
    [picker, setPicker] = useState<"source" | "audio" | "logo" | null>(null);
  const [execution, setExecution] = useState<MediaExecution | null>(null),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null),
    [loaded, setLoaded] = useState(false),
    [reload, setReload] = useState(0);
  const requestKey = useRef<string | null>(null),
    submitting = useRef(false);
  const tool = tools.find((item) => item.key === toolKey),
    source = assets.find((item) => item.id === sourceId),
    audio = assets.find((item) => item.id === audioId),
    logo = assets.find((item) => item.id === logoId);
  const base = `/app/${encodeURIComponent(organizationSlug)}`;
  const locked = busy || uncertain;
  const pendingForSource = history.some(
    (item) =>
      (activeStatuses.includes(item.status) ||
        item.status === "MANUAL_REVIEW") &&
      (item.sourceAsset?.id === sourceId ||
        (item.id === execution?.id && !item.sourceAsset)),
  );
  const requiresLogo =
    toolKey === "add-image-watermark" && settings.watermarkType === "image";
  const sourceIssue = source
    ? mediaToolSourceIssue(toolKey, `SOURCE_${sourceKind(toolKey)}`, source)
    : null;
  const ready = Boolean(
    source &&
    !sourceIssue &&
    tool?.available &&
    canGenerate &&
    (!requiresLogo ||
      (logo &&
        logo.id !== source.id &&
        !mediaToolSourceIssue(toolKey, "WATERMARK_IMAGE", logo))) &&
    (toolKey !== "lip-sync" ||
      (audio && !mediaToolSourceIssue(toolKey, "SOURCE_AUDIO", audio))) &&
    (toolKey !== "crop-image" || (source.width && source.height)) &&
    !pendingForSource,
  );
  useEffect(() => {
    let disposed = false;
    jsonRequest(
      `/api/media-tools?organizationId=${encodeURIComponent(organizationId)}`,
    )
      .then((payload) => {
        if (disposed) return;
        setTools(payload.tools);
        setAssets(payload.assets);
        setHistory(payload.executions);
        setLoaded(true);
      })
      .catch((error) => {
        if (!disposed) {
          setFeedback(error.message);
          setLoaded(true);
        }
      });
    return () => {
      disposed = true;
    };
  }, [organizationId, reload]);
  const pollIds = [
    ...new Set([
      ...history
        .filter(
          (item) =>
            activeStatuses.includes(item.status) ||
            item.status === "MANUAL_REVIEW",
        )
        .map((item) => item.id),
      ...(execution &&
      (!execution.tool ||
        activeStatuses.includes(execution.status) ||
        execution.status === "MANUAL_REVIEW" ||
        (execution.outputAsset &&
          !execution.outputAsset.variants.some(
            (variant) =>
              variant.kind ===
              (execution.outputAsset!.mediaKind === "IMAGE"
                ? "PREVIEW"
                : "POSTER"),
          )))
        ? [execution.id]
        : []),
    ]),
  ]
    .slice(0, 21)
    .join(",");
  useEffect(() => {
    if (!pollIds) return;
    let disposed = false,
      running = false;
    async function refresh() {
      if (running) return;
      running = true;
      const ids = pollIds.split(",");
      const results = await Promise.allSettled(
        ids.map((id) =>
          jsonRequest(`/api/media-tools/${encodeURIComponent(id)}`),
        ),
      );
      if (!disposed) {
        const updates = results.flatMap((result) =>
          result.status === "fulfilled"
            ? [result.value.execution as MediaExecution]
            : [],
        );
        setHistory((items) =>
          items.map((item) => ({
            ...item,
            ...updates.find((update) => update.id === item.id),
          })),
        );
        setExecution((current) =>
          current
            ? {
                ...current,
                ...updates.find((update) => update.id === current.id),
              }
            : current,
        );
        if (results.some((result) => result.status === "rejected"))
          setFeedback(
            "Some job statuses are temporarily unavailable. Saved jobs continue; status will retry automatically.",
          );
      }
      running = false;
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 6000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [pollIds]);
  function invalidate() {
    setQuote(null);
    setQuoteOpen(false);
    requestKey.current = null;
    setFeedback(null);
  }
  function changeSettings(patch: Partial<Settings>) {
    if (locked) return;
    invalidate();
    setSettings((current) => ({ ...current, ...patch }));
  }
  function changeCrop(value: Crop) {
    if (locked) return;
    invalidate();
    setCrop(value);
  }
  function chooseSource(id: string) {
    invalidate();
    setSourceId(id);
    const asset = assets.find((item) => item.id === id);
    setCrop(presetCrop(asset?.width ?? 1, asset?.height ?? 1, null));
  }
  function chooseTool(key: string) {
    if (locked) return;
    invalidate();
    setToolKey(key);
    if (source && source.mediaKind !== sourceKind(key)) setSourceId("");
    setSettings({ ...defaultSettings });
  }
  function useOutput(asset: MediaAsset) {
    if (locked) return;
    invalidate();
    setAssets((items) => [
      asset,
      ...items.filter((item) => item.id !== asset.id),
    ]);
    setSourceId(asset.id);
    const next =
      asset.mediaKind === "IMAGE" ? "compress-image" : "assess-video-quality";
    setToolKey(next);
    setGroup(toolGroup(next));
    setSettings({ ...defaultSettings });
    setCrop(presetCrop(asset.width ?? 1, asset.height ?? 1, null));
  }
  function body() {
    return {
      organizationId,
      toolKey,
      assetIds:
        toolKey === "lip-sync"
          ? [sourceId, audioId]
          : requiresLogo
            ? [sourceId, logoId]
            : [sourceId],
      input: mediaInput(toolKey, settings, crop),
    };
  }
  async function review(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      const payload = await jsonRequest("/api/media-tools", {
        ...body(),
        action: "quote",
      });
      setQuote(payload.quote);
      requestKey.current = crypto.randomUUID();
      setQuoteOpen(true);
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Quote is unavailable. Try again.",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  async function execute() {
    if (!quote || !requestKey.current || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      const payload = await jsonRequest("/api/media-tools", {
        ...body(),
        action: "execute",
        priceVersionId: quote.priceVersionId,
        reservedCredits: quote.reservedCredits,
        idempotencyKey: requestKey.current,
      });
      const next = {
        ...payload.execution,
        displayName: tool?.name,
        tool: toolKey,
        sourceAsset: source,
      };
      setExecution(next);
      setHistory((items) => [
        next,
        ...items.filter((item) => item.id !== next.id),
      ]);
      setUncertain(false);
      invalidate();
    } catch (error) {
      const ambiguous =
        uncertain || !(error instanceof RequestError) || error.status >= 500;
      setUncertain(ambiguous);
      if (ambiguous) {
        setQuoteOpen(false);
        setFeedback(
          "The response was interrupted. Acceptance is unconfirmed. Retry this same request to recover its saved job; do not start a duplicate.",
        );
      } else {
        setQuoteOpen(false);
        setQuote(null);
        requestKey.current = null;
        setFeedback(error.message);
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-7 sm:px-7 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Finishing desk</Eyebrow>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight">
            MediaKit <span className="sketch-underline">Tools</span>
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            Small edits. A sharper finish. Choose your media, make it yours, and
            review credits before processing.
          </p>
        </div>
        <Annotation className="text-primary">
          A little polish goes far
        </Annotation>
      </div>
      {!loaded && (
        <ProcessFeedback
          kind="loading"
          title="Opening your finishing desk"
          description="Loading tools and workspace media."
          className="mt-6"
        />
      )}
      {loaded && !tools.length && (
        <div className="mt-6">
          <ProcessFeedback
            kind="recoverable"
            title="Workspace could not load"
            description={feedback ?? "Try loading the workspace again."}
          />
          <Button
            type="button"
            variant="secondary"
            className="mt-3"
            onClick={() => {
              setLoaded(false);
              setReload((value) => value + 1);
            }}
          >
            Reload workspace
          </Button>
        </div>
      )}
      <div className="mt-7 grid min-w-0 gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <CreativeSurface className="min-w-0 self-start p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Your toolkit</h2>
            <span className="text-xs text-muted-foreground">
              {tools.length} tools
            </span>
          </div>
          <div
            className="mt-4 flex flex-wrap gap-1"
            aria-label="Tool categories"
          >
            {["Image", "Video finishing", "Analysis"].map((value) => (
              <button
                key={value}
                type="button"
                disabled={locked}
                aria-pressed={group === value}
                onClick={() => setGroup(value)}
                className="min-h-10 rounded-lg px-2 py-2 text-xs font-semibold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-primary/10 aria-pressed:text-primary"
              >
                {value}
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">
            {tools
              .filter((item) => toolGroup(item.key) === group)
              .map((item) => (
                <button
                  key={item.key}
                  type="button"
                  disabled={locked}
                  aria-pressed={toolKey === item.key}
                  onClick={() => chooseTool(item.key)}
                  title={item.description}
                  className="flex min-w-0 flex-col items-start rounded-2xl border border-border bg-background p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-primary aria-pressed:bg-primary/5 disabled:opacity-60"
                >
                  <MediaKitArt
                    tool={item.key}
                    className={`mb-3 size-10 ${toolKey === item.key ? "text-primary" : "text-muted-foreground"}`}
                  />
                  <span className="text-xs font-semibold leading-5">
                    {item.name}
                  </span>
                  {!item.available && (
                    <span className="mt-1 text-[10px] text-warning">
                      Unavailable
                    </span>
                  )}
                </button>
              ))}
          </div>
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            Compatible source media stays selected when you switch tools.
          </p>
          <Link
            href={`${base}/assets` as Route}
            className="mt-4 flex min-h-10 items-center gap-2 text-sm font-semibold text-primary"
          >
            <Icon name="upload" className="size-4" />
            Upload media
          </Link>
        </CreativeSurface>
        <div className="min-w-0 space-y-5">
          <CreativeSurface className="min-w-0 overflow-hidden">
            <div className="flex items-start gap-3 border-b border-border p-5">
              <MediaKitArt
                tool={toolKey}
                className="size-10 shrink-0 text-primary"
              />
              <div className="min-w-0">
                <h2 className="font-display text-2xl font-semibold">
                  {tool?.name ?? "Choose a tool"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {tool?.description}
                </p>
              </div>
            </div>
            <form
              onSubmit={review}
              className="grid min-w-0 xl:grid-cols-[minmax(0,1fr)_300px]"
            >
              <div className="min-w-0 p-4 sm:p-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {[
                      "crop-image",
                      "add-image-watermark",
                      "text-to-scrolling-video",
                    ].includes(toolKey)
                      ? "Layout guide"
                      : "Source preview"}
                  </span>
                  {source && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={locked}
                      onClick={() => setPicker("source")}
                    >
                      Change media
                    </Button>
                  )}
                </div>
                <LayoutPreview
                  tool={toolKey}
                  source={source}
                  settings={settings}
                  crop={crop}
                  logo={logo}
                  disabled={locked}
                  onCrop={changeCrop}
                />
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  {[
                    "crop-image",
                    "add-image-watermark",
                    "text-to-scrolling-video",
                  ].includes(toolKey)
                    ? "Guide only. Final sizing, typography and encoding are determined during processing."
                    : "This is your source media. The finished result appears below after processing."}
                </p>
                {toolKey === "lip-sync" && audio && (
                  <div className="mt-4 overflow-hidden rounded-xl border border-border">
                    <MediaPreview asset={audio} />
                  </div>
                )}
              </div>
              <fieldset
                disabled={locked}
                className="min-w-0 space-y-4 border-t border-border bg-muted/20 p-5 xl:border-l xl:border-t-0"
              >
                <AssetButton
                  asset={source}
                  label={`Source ${sourceKind(toolKey).toLowerCase()}`}
                  disabled={locked}
                  onClick={() => setPicker("source")}
                />
                {toolKey === "lip-sync" && (
                  <AssetButton
                    asset={audio}
                    label="Driving audio · MP3 or WAV"
                    disabled={locked}
                    onClick={() => setPicker("audio")}
                  />
                )}
                <MediaKitControls
                  tool={toolKey}
                  settings={settings}
                  onChange={changeSettings}
                  source={source}
                  crop={crop}
                  onCrop={changeCrop}
                  logo={logo}
                  chooseLogo={() => setPicker("logo")}
                />
                <div className="border-t border-border pt-4">
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={!ready || locked}
                  >
                    {busy ? "Working…" : "Review credit quote"}
                    <Icon name="arrow" className="size-4" />
                  </Button>
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">
                    {!canGenerate
                      ? "Your workspace role cannot start processing."
                      : !tool?.available
                        ? "This tool’s pricing or availability is pending."
                        : sourceIssue
                          ? sourceIssue
                          : pendingForSource
                            ? "This source has unsettled work. Wait for its saved job to finish."
                            : "No credits reserved until you confirm. Finished media is saved to your Asset Library."}
                  </p>
                </div>
              </fieldset>
            </form>
          </CreativeSurface>
          {feedback && (
            <ProcessFeedback
              kind={uncertain ? "delayed" : "recoverable"}
              title={uncertain ? "Recover your request" : "Workspace update"}
              description={feedback}
            />
          )}
          {uncertain && (
            <Button
              type="button"
              disabled={busy}
              onClick={() => void execute()}
            >
              {busy ? "Recovering…" : "Retry the same request"}
            </Button>
          )}
          {execution && (
            <MediaKitResult
              key={execution.id}
              execution={execution}
              base={base}
              onUse={useOutput}
            />
          )}
          <CreativeSurface className="min-w-0 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-xl font-semibold">
                Recent work
              </h2>
              <span className="text-xs text-muted-foreground">
                Saved jobs · continues in the background
              </span>
            </div>
            {history.length ? (
              <div className="mt-4 space-y-2">
                {history.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={item.id === execution?.id}
                    onClick={() => setExecution(item)}
                    className="flex min-h-12 w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-primary"
                  >
                    <span className="font-semibold">
                      {item.displayName ??
                        item.providerTool?.displayName ??
                        "MediaKit job"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {item.status.replaceAll("_", " ")}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                Your finished edits and active jobs will appear here.
              </p>
            )}
          </CreativeSurface>
        </div>
      </div>
      <AssetPicker
        open={picker !== null}
        kind={
          picker === "audio"
            ? "AUDIO"
            : picker === "logo"
              ? "IMAGE"
              : sourceKind(toolKey)
        }
        assets={
          picker === "logo"
            ? assets.filter(
                (asset) =>
                  asset.id !== sourceId &&
                  !mediaToolSourceIssue(toolKey, "WATERMARK_IMAGE", asset),
              )
            : assets.filter(
                (asset) =>
                  !mediaToolSourceIssue(
                    toolKey,
                    picker === "audio"
                      ? "SOURCE_AUDIO"
                      : `SOURCE_${sourceKind(toolKey)}`,
                    asset,
                  ),
              )
        }
        selected={
          picker === "audio" ? audioId : picker === "logo" ? logoId : sourceId
        }
        onClose={() => setPicker(null)}
        onSelect={(id) => {
          if (locked) return;
          if (picker === "source") chooseSource(id);
          else {
            invalidate();
            if (picker === "audio") setAudioId(id);
            else setLogoId(id);
          }
        }}
      />
      <MediaKitDialog
        open={quoteOpen}
        title="Review processing credits"
        onClose={() => {
          if (!busy) setQuoteOpen(false);
        }}
      >
        {quote && (
          <>
            <p className="text-sm font-semibold">{tool?.name}</p>
            <p className="mt-2 break-words text-sm text-muted-foreground">
              {source?.name} · {source ? assetDetail(source) : ""}
            </p>
            <div className="my-5 rounded-2xl border border-primary/30 bg-primary/5 p-5">
              <p className="text-sm text-muted-foreground">Reserve up to</p>
              <p className="mt-2 font-display text-3xl font-semibold tabular-nums">
                {quote.reservedCredits} credits
              </p>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Final charges follow successful processing and storage. Unused
                reserved credits are released.
                {toolKey.startsWith("matte-") ||
                toolKey === "text-to-scrolling-video"
                  ? " This ceiling includes the highest resolution tariff; final duration and resolution determine the charge."
                  : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                disabled={busy}
                onClick={() => void execute()}
              >
                {busy
                  ? "Submitting…"
                  : `Process · up to ${quote.reservedCredits} credits`}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => setQuoteOpen(false)}
              >
                Keep editing
              </Button>
            </div>
          </>
        )}
      </MediaKitDialog>
    </div>
  );
}
