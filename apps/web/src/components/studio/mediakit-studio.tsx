"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { CreativeSurface, Eyebrow } from "@/components/ui/creative";
import { Icon } from "@/components/ui/icon";
import { ProcessFeedback } from "@/components/process/process-feedback";

type Tool = {
  key: string;
  name: string;
  description: string;
  category: string;
  available: boolean;
};
type Asset = {
  id: string;
  name: string;
  mediaKind: string;
  mimeType: string;
  durationMs: number | null;
};
type Execution = {
  id: string;
  status: string;
  displayName?: string;
  providerTool?: { displayName: string };
  outputAssetId?: string | null;
  outputMimeType?: string | null;
  reservedCredits?: string;
  chargedCredits?: string;
  errorMessage?: string | null;
  vqScore?: number | null;
  segments?: { index: number; start_ms: number; end_ms: number }[];
};
type Quote = {
  priceVersionId: string;
  reservedCredits: string;
  quotedQuantity: number;
};
const fieldClass =
  "mt-2 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const activeStatuses = ["QUEUED", "SUBMITTING", "PROCESSING"];

async function jsonRequest(url: string, body?: unknown) {
  const response = await fetch(
    url,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const payload = await response.json();
  if (!response.ok)
    throw new Error(payload.error ?? "MediaKit request failed.");
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
  const [tools, setTools] = useState<Tool[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [history, setHistory] = useState<Execution[]>([]);
  const [toolKey, setToolKey] = useState("");
  const [source, setSource] = useState("");
  const [audio, setAudio] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [execution, setExecution] = useState<Execution | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const requestKey = useRef<string | null>(null);
  const tool = tools.find((item) => item.key === toolKey);
  const imageSource =
    tool?.category === "image" || toolKey === "text-to-scrolling-video";
  const pending =
    execution &&
    (activeStatuses.includes(execution.status) ||
      execution.status === "MANUAL_REVIEW");
  const base = `/app/${encodeURIComponent(organizationSlug)}`;

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
        setToolKey(
          (current) =>
            current ||
            payload.tools.find((item: Tool) => item.available)?.key ||
            payload.tools[0]?.key ||
            "",
        );
        const active = payload.executions.find(
          (item: Execution) =>
            activeStatuses.includes(item.status) ||
            item.status === "MANUAL_REVIEW",
        );
        if (active) setExecution(active);
      })
      .catch((error) => {
        if (!disposed) setFeedback(error.message);
      });
    return () => {
      disposed = true;
    };
  }, [organizationId]);

  useEffect(() => {
    if (!execution?.id) return;
    let disposed = false;
    const id = execution.id;
    async function refresh() {
      try {
        const payload = await jsonRequest(
          `/api/media-tools/${encodeURIComponent(id)}`,
        );
        if (!disposed) setExecution(payload.execution);
      } catch (error) {
        if (!disposed)
          setFeedback(
            error instanceof Error
              ? error.message
              : "Status is temporarily unavailable. Your job continues.",
          );
      }
    }
    void refresh();
    const timer = activeStatuses.includes(execution.status)
      ? setInterval(() => void refresh(), 4000)
      : null;
    return () => {
      disposed = true;
      if (timer) clearInterval(timer);
    };
  }, [execution?.id, execution?.status]);

  function invalidateQuote() {
    setQuote(null);
    requestKey.current = null;
  }
  function inputFromForm() {
    const data = new FormData(form.current!);
    if (toolKey.startsWith("matte-"))
      return data.get("format") === "MP4"
        ? { format: "MP4", background_color: data.get("background_color") }
        : { format: "WEBM" };
    if (toolKey === "compress-image")
      return { quality: Number(data.get("quality")), output_format: "jpeg" };
    if (toolKey === "crop-image")
      return {
        crop_mode: "directional",
        crop_position: "center",
        crop_width: Number(data.get("crop_width")),
        crop_height: Number(data.get("crop_height")),
        output_format: "png",
      };
    if (toolKey === "mosaic-image")
      return {
        mosaic_type: "full-image",
        mosaic_shape: "rectangle",
        mosaic_step_x: Number(data.get("pixelSize")),
        mosaic_step_y: Number(data.get("pixelSize")),
        output_format: "png",
      };
    if (toolKey === "add-image-watermark")
      return {
        watermark_type: "text",
        watermark_text: data.get("watermark_text"),
        watermark_position: data.get("watermark_position"),
        output_format: "png",
      };
    if (toolKey === "text-to-scrolling-video")
      return {
        text: data.get("text"),
        resolution: data.get("resolution"),
        font_type: data.get("font_type"),
        font_color: `${data.get("font_color")}FF`,
        single_roll_duration: Number(data.get("single_roll_duration")),
        start_hold_duration: 2,
        end_hold_duration: 2,
      };
    return {};
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!tool || !source) return;
    setBusy(true);
    setFeedback(null);
    try {
      const body = {
        organizationId,
        toolKey,
        assetIds: toolKey === "lip-sync" ? [source, audio] : [source],
        input: inputFromForm(),
      };
      if (!quote) {
        const payload = await jsonRequest("/api/media-tools", {
          ...body,
          action: "quote",
        });
        setQuote(payload.quote);
        requestKey.current = crypto.randomUUID();
      } else {
        const payload = await jsonRequest("/api/media-tools", {
          ...body,
          action: "execute",
          priceVersionId: quote.priceVersionId,
          reservedCredits: quote.reservedCredits,
          idempotencyKey: requestKey.current,
        });
        setExecution({ ...payload.execution, displayName: tool.name });
        setHistory((items) => [payload.execution, ...items]);
        invalidateQuote();
      }
    } catch (error) {
      if (
        error instanceof Error &&
        /quote.*(changed|stale)|refresh/i.test(error.message)
      )
        invalidateQuote();
      setFeedback(
        error instanceof Error
          ? error.message
          : "Request failed. Retry with the same inputs.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-4 py-7 sm:px-7 lg:px-9">
      <Eyebrow>Finishing desk</Eyebrow>
      <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight">
        MediaKit Tools
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
        Polish, protect and prepare your media. Choose a workspace asset, review
        your credit reservation, and save the finished result to your library.
      </p>
      <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <CreativeSurface className="p-5">
          <h2 className="font-display text-xl font-semibold">
            Choose your tool
          </h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            {tools.map((item) => (
              <button
                key={item.key}
                type="button"
                disabled={busy}
                aria-pressed={toolKey === item.key}
                onClick={() => {
                  setToolKey(item.key);
                  setSource("");
                  setAudio("");
                  invalidateQuote();
                }}
                className={`rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${toolKey === item.key ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-muted"}`}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <Icon
                    name={item.category === "image" ? "image" : "video"}
                    className="size-4"
                  />
                  {item.name}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {item.description}
                </span>
                {!item.available ? (
                  <span className="mt-2 block text-xs text-warning">
                    Pricing or availability is pending
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </CreativeSurface>
        <div className="space-y-5">
          <CreativeSurface className="p-5 sm:p-6">
            <h2 className="font-display text-2xl font-semibold">
              {tool?.name ?? "Loading tools…"}
            </h2>
            <form
              ref={form}
              key={toolKey}
              onSubmit={submit}
              onChange={invalidateQuote}
              className="mt-5 space-y-4"
            >
              <fieldset disabled={busy} className="space-y-4">
                <label className="block text-sm font-semibold">
                  {imageSource ? "Source image" : "Source video"}
                  <select
                    className={fieldClass}
                    value={source}
                    required
                    onChange={(event) => setSource(event.target.value)}
                  >
                    <option value="">Choose a workspace asset</option>
                    {assets
                      .filter(
                        (asset) =>
                          asset.mediaKind === (imageSource ? "IMAGE" : "VIDEO"),
                      )
                      .map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          {asset.name}
                        </option>
                      ))}
                  </select>
                </label>
                <p className="text-xs text-muted-foreground">
                  Need new media?{" "}
                  <Link
                    href={`${base}/assets` as Route}
                    className="text-primary underline"
                  >
                    Upload it in your Asset Library
                  </Link>
                  , then return here.
                </p>
                {toolKey === "lip-sync" ? (
                  <label className="block text-sm font-semibold">
                    Driving audio
                    <select
                      className={fieldClass}
                      value={audio}
                      required
                      onChange={(event) => setAudio(event.target.value)}
                    >
                      <option value="">Choose audio</option>
                      {assets
                        .filter((asset) => asset.mediaKind === "AUDIO")
                        .map((asset) => (
                          <option key={asset.id} value={asset.id}>
                            {asset.name}
                          </option>
                        ))}
                    </select>
                  </label>
                ) : null}
                {toolKey.startsWith("matte-") ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-semibold">
                      Output format
                      <select
                        name="format"
                        className={fieldClass}
                        defaultValue="WEBM"
                      >
                        <option value="WEBM">Transparent WebM</option>
                        <option value="MP4">MP4 with solid background</option>
                      </select>
                    </label>
                    <label className="text-sm font-semibold">
                      MP4 background
                      <select
                        name="background_color"
                        className={fieldClass}
                        defaultValue="green"
                      >
                        <option value="green">Green</option>
                        <option value="black">Black</option>
                        <option value="white">White</option>
                      </select>
                    </label>
                  </div>
                ) : null}
                {toolKey === "compress-image" ? (
                  <label className="block text-sm font-semibold">
                    JPEG quality (1–100)
                    <input
                      name="quality"
                      className={fieldClass}
                      type="number"
                      min="1"
                      max="100"
                      defaultValue="80"
                      required
                    />
                  </label>
                ) : null}
                {toolKey === "crop-image" ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {["crop_width", "crop_height"].map((name) => (
                      <label key={name} className="text-sm font-semibold">
                        {name === "crop_width" ? "Width" : "Height"} (pixels)
                        <input
                          name={name}
                          className={fieldClass}
                          type="number"
                          min="1"
                          max="10000"
                          defaultValue="512"
                          required
                        />
                      </label>
                    ))}
                  </div>
                ) : null}
                {toolKey === "mosaic-image" ? (
                  <label className="block text-sm font-semibold">
                    Pixel cell size
                    <input
                      name="pixelSize"
                      className={fieldClass}
                      type="number"
                      min="1"
                      max="1000"
                      defaultValue="16"
                      required
                    />
                  </label>
                ) : null}
                {toolKey === "add-image-watermark" ? (
                  <>
                    <label className="block text-sm font-semibold">
                      Watermark text
                      <input
                        name="watermark_text"
                        className={fieldClass}
                        maxLength={200}
                        placeholder="© Your brand"
                        required
                      />
                    </label>
                    <label className="block text-sm font-semibold">
                      Position
                      <select
                        name="watermark_position"
                        className={fieldClass}
                        defaultValue="bottom_right"
                      >
                        {[
                          "bottom_right",
                          "bottom_left",
                          "top_right",
                          "top_left",
                          "center",
                        ].map((position) => (
                          <option key={position} value={position}>
                            {position.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : null}
                {toolKey === "text-to-scrolling-video" ? (
                  <>
                    <label className="block text-sm font-semibold">
                      Scrolling text
                      <textarea
                        name="text"
                        className={fieldClass}
                        rows={6}
                        maxLength={2000}
                        required
                      />
                    </label>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="text-sm font-semibold">
                        Resolution
                        <select
                          name="resolution"
                          className={fieldClass}
                          defaultValue="720p"
                        >
                          {["360p", "480p", "720p", "1080p"].map((value) => (
                            <option key={value}>{value}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm font-semibold">
                        Seconds per page
                        <input
                          name="single_roll_duration"
                          type="number"
                          min="0.5"
                          max="60"
                          step="0.5"
                          defaultValue="3"
                          className={fieldClass}
                          required
                        />
                      </label>
                      <label className="text-sm font-semibold">
                        Font
                        <select
                          name="font_type"
                          className={fieldClass}
                          defaultValue="inter"
                        >
                          <option value="inter">Inter</option>
                          <option value="roboto">Roboto</option>
                          <option value="source_han_serif">
                            Source Han Serif
                          </option>
                        </select>
                      </label>
                      <label className="text-sm font-semibold">
                        Text color
                        <input
                          name="font_color"
                          type="color"
                          defaultValue="#1F1F1F"
                          className={fieldClass}
                        />
                      </label>
                    </div>
                  </>
                ) : null}
                {quote ? (
                  <div
                    role="status"
                    className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm"
                  >
                    <p className="font-semibold">
                      Reserve up to {quote.reservedCredits} credits
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Final charge follows successful processing and output
                      storage. Unused credits are released.
                      {toolKey.startsWith("matte-") ||
                      toolKey === "text-to-scrolling-video"
                        ? " This ceiling includes the highest resolution tariff; final output duration and resolution determine the charge."
                        : ""}
                    </p>
                  </div>
                ) : null}
                <Button
                  type="submit"
                  disabled={
                    busy || Boolean(pending) || !canGenerate || !tool?.available
                  }
                >
                  {busy
                    ? "Working…"
                    : quote
                      ? `Run · reserve ${quote.reservedCredits} credits`
                      : "Review credit quote"}
                </Button>
              </fieldset>
            </form>
            {feedback ? (
              <p role="status" className="mt-4 text-sm text-muted-foreground">
                {feedback}
              </p>
            ) : null}
          </CreativeSurface>
          {execution ? (
            <CreativeSurface className="p-5">
              <h2 className="font-display text-xl font-semibold">
                {execution.displayName ?? "Tool result"}
              </h2>
              <p role="status" className="mt-2 text-sm">
                {execution.status.replaceAll("_", " ")}
              </p>
              {activeStatuses.includes(execution.status) ? (
                <ProcessFeedback
                  kind="loading"
                  title="Processing your media"
                  description="Your saved job continues in the background. You can leave this page and return to Recent work."
                  className="mt-3"
                />
              ) : execution.status === "MANUAL_REVIEW" ? (
                <ProcessFeedback
                  kind="delayed"
                  title="Operator review needed"
                  description="Credits remain reserved. Avoid submitting this work again while the result is being reviewed."
                  className="mt-3"
                />
              ) : null}
              <p className="mt-2 text-xs text-muted-foreground">
                Job {execution.id}. Work continues when you leave this page.
              </p>
              {execution.errorMessage ? (
                <p className="mt-3 text-sm text-warning">
                  {execution.errorMessage}
                </p>
              ) : null}
              {execution.status === "MANUAL_REVIEW" ? (
                <p className="mt-2 text-sm">
                  Credits remain reserved for operator review. Avoid submitting
                  this work again.
                </p>
              ) : null}
              {execution.vqScore != null ? (
                <p className="mt-3 font-semibold">
                  Video quality score: {execution.vqScore} / 100
                </p>
              ) : null}
              {execution.segments?.length ? (
                <div className="mt-3 max-h-64 overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="text-left">Segment</th>
                        <th className="text-left">Start (ms)</th>
                        <th className="text-left">End (ms)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {execution.segments.map((segment) => (
                        <tr key={segment.index}>
                          <td>{segment.index + 1}</td>
                          <td>{segment.start_ms}</td>
                          <td>{segment.end_ms}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {execution.outputAssetId ? (
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button asChild>
                    <a
                      href={`/api/assets/${encodeURIComponent(execution.outputAssetId)}?download=1`}
                    >
                      Download result
                    </a>
                  </Button>
                  <Button asChild variant="secondary">
                    <Link href={`${base}/assets` as Route}>
                      Open Asset Library
                    </Link>
                  </Button>
                </div>
              ) : null}
              {execution.status === "SUCCEEDED" ? (
                <p className="mt-3 text-sm text-success">
                  Saved successfully · {execution.chargedCredits} credits
                  charged
                </p>
              ) : null}
            </CreativeSurface>
          ) : null}
          {history.length ? (
            <CreativeSurface className="p-5">
              <h2 className="font-display text-xl font-semibold">
                Recent work
              </h2>
              <div className="mt-3 space-y-2">
                {history.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setExecution(item)}
                    className="flex w-full justify-between gap-3 rounded-lg border border-border p-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span>
                      {item.providerTool?.displayName ?? "MediaKit job"}
                    </span>
                    <span className="text-muted-foreground">
                      {item.status.replaceAll("_", " ")}
                    </span>
                  </button>
                ))}
              </div>
            </CreativeSurface>
          ) : null}
        </div>
      </div>
    </div>
  );
}
