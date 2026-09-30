"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/creative";

type Asset = {
  id: string;
  name: string | null;
  width: number | null;
  height: number | null;
};
type EditKind = "crop" | "resize" | "scale";

export function ImageEditor({
  organizationId,
  organizationSlug,
  canEdit,
  initialAssetId,
}: {
  organizationId: string;
  organizationSlug: string;
  canEdit: boolean;
  initialAssetId?: string;
}) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [kind, setKind] = useState<EditKind>("crop");
  const [format, setFormat] = useState<"png" | "jpeg" | "webp">("png");
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [factor, setFactor] = useState<0.25 | 0.5 | 0.75 | 2 | 4>(2);
  const [fit, setFit] = useState<"contain" | "cover" | "fill">("contain");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; status: string } | null>(
    null,
  );
  const [operationId, setOperationId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<{
    fingerprint: string;
    key: string;
  } | null>(null);
  const selected = assets.find((asset) => asset.id === selectedId);

  useEffect(() => {
    let active = true;
    void fetch(
      `/api/assets?organizationId=${encodeURIComponent(organizationId)}&mediaKind=IMAGE&limit=100`,
      { cache: "no-store" },
    )
      .then(async (res) => {
        if (!res.ok) throw new Error("Image library could not be loaded.");
        return res.json() as Promise<{ assets: Asset[] }>;
      })
      .then((data) => {
        if (active) {
          setAssets(data.assets);
          if (initialAssetId) {
            if (data.assets.some((asset) => asset.id === initialAssetId))
              setSelectedId((current) => current || initialAssetId);
            else
              void fetch(
                `/api/assets?organizationId=${encodeURIComponent(organizationId)}&mediaKind=IMAGE&assetId=${encodeURIComponent(initialAssetId)}`,
                { cache: "no-store" },
              )
                .then(async (response) =>
                  response.ok
                    ? (response.json() as Promise<{ assets: Asset[] }>)
                    : { assets: [] },
                )
                .then((result) => {
                  if (active && result.assets[0]) {
                    setAssets((previous) => [result.assets[0]!, ...previous]);
                    setSelectedId((current) => current || initialAssetId);
                  }
                })
                .catch(() => {
                  if (active) setError("Source image could not be loaded.");
                });
          }
        }
      })
      .catch((err: unknown) => {
        if (active)
          setError(
            err instanceof Error ? err.message : "Image library unavailable.",
          );
      });
    return () => {
      active = false;
    };
  }, [organizationId, result?.id, initialAssetId]);

  useEffect(() => {
    if (!operationId) return;
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch(
          `/api/assets/image-operations?organizationId=${encodeURIComponent(organizationId)}&operationId=${encodeURIComponent(operationId)}`,
          { cache: "no-store" },
        );
        const body = (await res.json()) as {
          status?: string;
          processingState?: string;
          outputAssetId?: string;
          errorMessage?: string;
          error?: string;
        };
        if (!res.ok) throw new Error(body.error ?? "Edit status unavailable.");
        if (!active) return;
        if (body.status === "SUCCEEDED" && body.outputAssetId) {
          setResult({ id: body.outputAssetId, status: "Ready" });
          setOperationId(null);
          setBusy(false);
          setAttempt(null);
        }
        if (body.processingState === "REVIEW")
          setError(
            "This edit needs support review. Your source is safe; contact support before retrying.",
          );
        if (body.status === "FAILED" || body.processingState === "FAILED") {
          setError(body.errorMessage ?? "Image edit failed.");
          setOperationId(null);
          setBusy(false);
          setAttempt(null);
        }
      } catch (err) {
        if (active)
          setError(
            err instanceof Error
              ? err.message
              : "Status temporarily unavailable.",
          );
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 2_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [operationId, organizationId]);

  function chooseAsset(id: string) {
    const asset = assets.find((value) => value.id === id);
    setSelectedId(id);
    setX(0);
    setY(0);
    setWidth(asset?.width ?? 1024);
    setHeight(asset?.height ?? 1024);
    setResult(null);
    setError(null);
    setAttempt(null);
  }

  async function submit() {
    if (!selected || busy || !canEdit) return;
    const transform =
      kind === "crop"
        ? { kind, x, y, width, height }
        : kind === "resize"
          ? { kind, width, height, fit }
          : { kind, factor };
    const fingerprint = JSON.stringify({ selectedId, transform, format });
    const key =
      attempt?.fingerprint === fingerprint ? attempt.key : crypto.randomUUID();
    setAttempt({ fingerprint, key });
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/assets/image-operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          sourceAssetId: selectedId,
          idempotencyKey: key,
          transform,
          format,
        }),
      });
      const body = (await res.json()) as {
        operationId?: string;
        error?: string;
      };
      if (!res.ok || !body.operationId)
        throw new Error(body.error ?? "Edit could not be queued.");
      setOperationId(body.operationId);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Edit could not be queued.",
      );
      setBusy(false);
    }
  }

  return (
    <section
      id="image-editor"
      className="paper-sheet relative rounded-[28px] border border-border p-5 sm:p-7"
      aria-label="Image editor"
    >
      <Eyebrow>Image editing desk</Eyebrow>
      <h2 className="font-display mt-2 text-2xl font-semibold text-foreground">
        Make another version.
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Crop or resample an image. Your original stays intact; each edit becomes
        a new private asset. Upscaling here uses high-quality interpolation.
      </p>
      <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.8fr)]">
        <div className="min-w-0 rounded-2xl border border-border bg-surface-sunken p-4">
          {selected ? (
            <Image
              src={`/api/assets/${selected.id}`}
              alt={selected.name ?? "Source image"}
              width={selected.width ?? 1024}
              height={selected.height ?? 1024}
              unoptimized
              className="mx-auto max-h-[500px] w-auto max-w-full rounded-xl object-contain"
            />
          ) : (
            <p className="grid min-h-64 place-items-center text-sm text-muted-foreground">
              Choose a source image to begin.
            </p>
          )}
          {selected ? (
            <p className="mt-3 text-xs text-muted-foreground">
              {selected.width} × {selected.height} px ·{" "}
              {selected.name ?? "Untitled"}
            </p>
          ) : null}
        </div>
        <div className="space-y-4">
          <label className="grid gap-2 text-sm font-semibold">
            Source image
            <select
              value={selectedId}
              onChange={(e) => chooseAsset(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-input bg-card px-3 text-foreground"
            >
              <option value="">Choose from your library…</option>
              {assets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name ?? "Untitled image"} · {asset.width ?? "?"} ×{" "}
                  {asset.height ?? "?"}
                </option>
              ))}
            </select>
          </label>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Edit action"
          >
            {(["crop", "resize", "scale"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setKind(option);
                  setAttempt(null);
                }}
                aria-pressed={kind === option}
                className={`min-h-10 rounded-xl border px-4 text-sm font-semibold capitalize ${kind === option ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground"}`}
              >
                {option === "scale" ? "Upscale / downscale" : option}
              </button>
            ))}
          </div>
          {kind === "crop" ? (
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ["Left", x, setX],
                  ["Top", y, setY],
                  ["Width", width, setWidth],
                  ["Height", height, setHeight],
                ] as const
              ).map(([label, value, setter]) => (
                <label key={label} className="grid gap-1 text-xs font-semibold">
                  {label} (px)
                  <input
                    type="number"
                    min={label === "Left" || label === "Top" ? 0 : 1}
                    max={8192}
                    value={value}
                    onChange={(e) => setter(Number(e.target.value))}
                    className="min-h-11 rounded-xl border border-input bg-card px-3 text-foreground"
                  />
                </label>
              ))}
            </div>
          ) : null}
          {kind === "resize" ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1 text-xs font-semibold">
                Width (px)
                <input
                  type="number"
                  min={1}
                  max={8192}
                  value={width}
                  onChange={(e) => setWidth(Number(e.target.value))}
                  className="min-h-11 rounded-xl border border-input bg-card px-3"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold">
                Height (px)
                <input
                  type="number"
                  min={1}
                  max={8192}
                  value={height}
                  onChange={(e) => setHeight(Number(e.target.value))}
                  className="min-h-11 rounded-xl border border-input bg-card px-3"
                />
              </label>
              <label className="col-span-2 grid gap-1 text-xs font-semibold">
                Fit
                <select
                  value={fit}
                  onChange={(e) => setFit(e.target.value as typeof fit)}
                  className="min-h-11 rounded-xl border border-input bg-card px-3"
                >
                  <option value="contain">Contain</option>
                  <option value="cover">Cover</option>
                  <option value="fill">Stretch</option>
                </select>
              </label>
            </div>
          ) : null}
          {kind === "scale" ? (
            <label className="grid gap-2 text-sm font-semibold">
              Scale
              <select
                value={factor}
                onChange={(e) =>
                  setFactor(Number(e.target.value) as typeof factor)
                }
                className="min-h-11 rounded-xl border border-input bg-card px-3"
              >
                {[0.25, 0.5, 0.75, 2, 4].map((value) => (
                  <option key={value} value={value}>
                    {value}× {value > 1 ? "upscale" : "downscale"}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="grid gap-2 text-sm font-semibold">
            Output format
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as typeof format)}
              className="min-h-11 rounded-xl border border-input bg-card px-3"
            >
              <option value="png">PNG</option>
              <option value="jpeg">JPEG</option>
              <option value="webp">WebP</option>
            </select>
          </label>
          <Button
            type="button"
            className="w-full"
            disabled={!selected || busy || !canEdit}
            onClick={() => void submit()}
          >
            {busy ? "Making your edit…" : "Save new image"}
          </Button>
          {operationId ? (
            <p role="status" className="text-sm text-muted-foreground">
              Edit queued. This page will show the saved asset when ready.
            </p>
          ) : null}
          {error ? (
            <p
              role="alert"
              className="rounded-xl border border-destructive p-3 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
          {result ? (
            <div
              role="status"
              className="rounded-xl border border-success/30 bg-success/10 p-4 text-sm"
            >
              New image ready.{" "}
              <Link
                href={`/app/${organizationSlug}/assets`}
                className="font-semibold text-primary underline"
              >
                View in your library
              </Link>{" "}
              ·{" "}
              <a
                href={`/api/assets/${result.id}?download`}
                className="font-semibold text-primary underline"
              >
                Download
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
