/* eslint-disable @next/next/no-img-element -- Protected same-origin previews. */
"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { CreativeSurface } from "@/components/ui/creative";
import { Button } from "@/components/ui/button";
import { ProcessFeedback } from "@/components/process/process-feedback";
import { MascotScene } from "@/components/process/mascot-scene";
import { MediaPreview } from "./mediakit-controls";
import {
  activeStatuses,
  assetDetail,
  byteLabel,
  previewUrl,
  timeLabel,
  type MediaAsset,
  type MediaExecution,
} from "./mediakit-model";

export function MediaKitResult({
  execution: e,
  base,
  onUse,
}: {
  execution: MediaExecution;
  base: string;
  onUse: (asset: MediaAsset) => void;
}) {
  const [compare, setCompare] = useState(50);
  const videoRef = useRef<HTMLVideoElement>(null);
  const output = e.outputAsset,
    source = e.sourceAsset;
  const checker = {
    backgroundColor: "var(--background)",
    backgroundImage:
      "conic-gradient(var(--muted) 25%, transparent 0 50%, var(--muted) 0 75%, transparent 0)",
    backgroundSize: "24px 24px",
  };
  const processing = activeStatuses.includes(e.status);
  const compareImages =
    source?.mediaKind === "IMAGE" &&
    output?.mediaKind === "IMAGE" &&
    previewUrl(source) &&
    previewUrl(output);
  const score =
    e.vqScore != null && e.status === "SUCCEEDED" ? e.vqScore : null;
  return (
    <CreativeSurface className="min-w-0 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl font-semibold">
          {e.displayName ?? e.providerTool?.displayName ?? "Tool result"}
        </h2>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${e.status === "SUCCEEDED" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}
        >
          {e.status.replaceAll("_", " ")}
        </span>
      </div>
      {processing ? (
        <div role="status" className="mt-4 flex flex-wrap items-center gap-4">
          <MascotScene kind="working" size="compact" />
          <div className="max-w-md">
            <p className="font-semibold">Processing your media</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Your saved job continues in the background. Return to Recent work
              at any time.
            </p>
          </div>
        </div>
      ) : e.status === "MANUAL_REVIEW" ? (
        <ProcessFeedback
          kind="delayed"
          title="Operator review needed"
          description="Credits remain reserved. Avoid submitting this work again while the result is being reviewed."
          className="mt-4"
        />
      ) : e.status === "SUCCEEDED" ? (
        <div role="status" className="mt-4 flex flex-wrap items-center gap-3">
          <MascotScene kind="celebration" size="compact" />
          <div>
            <p className="font-semibold text-success">Finished and saved</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {e.chargedCredits ?? "0"} credits charged. Unused reserved credits
              released.
            </p>
          </div>
        </div>
      ) : (
        <ProcessFeedback
          kind="error"
          title="Processing did not complete"
          description={
            e.errorMessage ?? "Open Recent work for the saved job status."
          }
          className="mt-4"
        />
      )}
      {e.status === "SUCCEEDED" && (
        <>
          {compareImages ? (
            <div className="mt-5">
              <div
                className="relative aspect-video overflow-hidden rounded-2xl"
                style={checker}
              >
                <img
                  src={previewUrl(source!)!}
                  alt={`Before: ${source!.name}`}
                  className="absolute inset-0 size-full object-contain"
                />
                <img
                  src={previewUrl(output!)!}
                  alt={`After: ${output!.name}`}
                  className="absolute inset-0 size-full object-contain"
                  style={{ clipPath: `inset(0 0 0 ${compare}%)` }}
                />
                <span
                  className="pointer-events-none absolute inset-y-0 border-l-2 border-primary"
                  style={{ left: `${compare}%` }}
                />
                <span className="absolute left-3 top-3 rounded-lg bg-background/90 px-2 py-1 text-xs">
                  Before
                </span>
                <span className="absolute right-3 top-3 rounded-lg bg-background/90 px-2 py-1 text-xs">
                  After
                </span>
              </div>
              <label className="mt-3 block text-sm font-semibold">
                Before / after comparison
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={compare}
                  onChange={(event) => setCompare(Number(event.target.value))}
                  className="block min-h-10 w-full accent-primary"
                />
              </label>
            </div>
          ) : output ? (
            <div className="mt-5 overflow-hidden rounded-2xl" style={checker}>
              <MediaPreview asset={output} />
            </div>
          ) : source?.mediaKind === "VIDEO" ? (
            <div className="mt-5 overflow-hidden rounded-2xl bg-muted">
              <MediaPreview asset={source} videoRef={videoRef} />
            </div>
          ) : null}
          {output && (
            <p className="mt-3 text-sm text-muted-foreground">
              {assetDetail(output)}
            </p>
          )}
          {source && output && e.tool === "compress-image" && (
            <div className="mt-4 rounded-xl bg-muted/50 p-4 text-sm">
              <p className="font-semibold">Actual file sizes</p>
              <p className="mt-1">
                {byteLabel(source.byteSize)} → {byteLabel(output.byteSize)}
              </p>
              <p className="mt-1 text-muted-foreground">
                {Number(source.byteSize) > Number(output.byteSize)
                  ? `${Math.round((1 - Number(output.byteSize) / Number(source.byteSize)) * 100)}% smaller`
                  : "Output is not smaller than the source."}
              </p>
            </div>
          )}
          {score !== null && (
            <div className="mt-5 rounded-2xl border border-border p-5">
              <p className="text-sm text-muted-foreground">
                Provider video quality score
              </p>
              <p className="mt-2 font-display text-4xl font-semibold tabular-nums">
                {score}
                <span className="text-lg text-muted-foreground"> / 100</span>
              </p>
              <meter
                aria-label="Video quality score"
                min={0}
                max={100}
                value={score}
                className="mt-3 h-4 w-full"
              />
            </div>
          )}
          {e.segments?.length ? (
            <div className="mt-5">
              <h3 className="text-sm font-semibold">
                Semantic segments · {e.segments.length}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Choose a segment to seek the source video.
              </p>
              <div className="mt-3 flex min-h-10 overflow-hidden rounded-lg border border-border">
                {e.segments.map((segment) => (
                  <button
                    key={segment.index}
                    type="button"
                    className="min-w-10 border-r border-border bg-primary/10 px-2 text-xs text-primary hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    style={{
                      flexGrow: Math.max(1, segment.end_ms - segment.start_ms),
                    }}
                    aria-label={`Play segment ${segment.index + 1}, ${timeLabel(segment.start_ms)} to ${timeLabel(segment.end_ms)}`}
                    onClick={() => {
                      if (videoRef.current)
                        videoRef.current.currentTime = segment.start_ms / 1000;
                    }}
                  >
                    {segment.index + 1}
                  </button>
                ))}
              </div>
              <div className="mt-3 max-h-52 overflow-auto">
                {e.segments.map((segment) => (
                  <button
                    key={segment.index}
                    type="button"
                    className="flex min-h-10 w-full items-center justify-between gap-3 border-b border-border px-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => {
                      if (videoRef.current) {
                        videoRef.current.currentTime = segment.start_ms / 1000;
                        videoRef.current.focus();
                      }
                    }}
                  >
                    <span>Segment {segment.index + 1}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {timeLabel(segment.start_ms)} –{" "}
                      {timeLabel(segment.end_ms)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {e.outputAssetId && (
            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild>
                <a
                  href={`/api/assets/${encodeURIComponent(e.outputAssetId)}?download=1`}
                >
                  Download result
                </a>
              </Button>
              {output && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => onUse(output)}
                >
                  Use in another tool
                </Button>
              )}
              <Button asChild variant="ghost">
                <Link href={`${base}/assets` as Route}>Asset Library</Link>
              </Button>
            </div>
          )}
        </>
      )}
      <p className="mt-4 break-all text-xs text-muted-foreground">
        Saved job {e.id}
      </p>
    </CreativeSurface>
  );
}
