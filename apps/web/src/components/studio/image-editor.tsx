"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/creative";
import { Icon } from "@/components/ui/icon";
import {
  MediaCropper,
  type MediaCropArea,
  type QuarterTurn,
} from "@/components/studio/media-cropper";
import { renderImageEdit } from "@/lib/client-image-edit";
import {
  downloadPsdFile,
  validatePsdExportLayout,
  type PsdLayerInput,
} from "@/lib/psd-export";

type Asset = {
  id: string;
  name: string | null;
  width: number | null;
  height: number | null;
};

type WorkspaceMode = "ai" | "layers" | "pixel";
type AiTool = "inpaint" | "outpaint" | "replace";
type AiRatio = "1:1" | "16:9" | "9:16" | "21:9" | "4:3" | "3:4" | "3:2" | "2:3";
type PixelEditKind = "crop" | "resize" | "scale";
type PixelAspect = "original" | "1:1" | "4:3" | "16:9" | "9:16";

const PIXEL_ASPECTS: Record<Exclude<PixelAspect, "original">, number> = {
  "1:1": 1,
  "4:3": 4 / 3,
  "16:9": 16 / 9,
  "9:16": 9 / 16,
};

const AI_RATIOS: readonly [AiRatio, number][] = [
  ["1:1", 1],
  ["16:9", 16 / 9],
  ["9:16", 9 / 16],
  ["21:9", 21 / 9],
  ["4:3", 4 / 3],
  ["3:4", 3 / 4],
  ["3:2", 3 / 2],
  ["2:3", 2 / 3],
];

function nearestAiRatio(width: number, height: number): AiRatio {
  if (width <= 0 || height <= 0) return "1:1";
  const ratio = width / height;
  return AI_RATIOS.reduce((best, current) =>
    Math.abs(current[1] - ratio) < Math.abs(best[1] - ratio) ? current : best,
  )[0];
}

export interface CanvasLayer {
  id: string;
  name: string;
  assetId?: string;
  imageUrl?: string;
  top: number;
  left: number;
  width: number;
  height: number;
  opacity: number; // 0 to 255
  visible: boolean;
  blendMode: "norm" | "mul " | "scrn" | "over";
  color?: string;
}

export function ImageEditor({
  organizationId,
  organizationSlug,
  canEdit,
  canGenerate,
  initialAssetId,
  initialMode = "ai",
}: {
  organizationId: string;
  organizationSlug: string;
  canEdit: boolean;
  canGenerate: boolean;
  initialAssetId?: string;
  initialMode?: WorkspaceMode;
}) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(initialMode);

  // AI Precision Edit states (Seedream 5.0 Pro)
  const [aiTool, setAiTool] = useState<AiTool>("inpaint");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResolution, setAiResolution] = useState<"1K" | "1.5K" | "2K">(
    "1.5K",
  );
  const [aiRatio, setAiRatio] = useState<AiRatio>("1:1");
  const [boxYmin, setBoxYmin] = useState(200);
  const [boxXmin, setBoxXmin] = useState(200);
  const [boxYmax, setBoxYmax] = useState(800);
  const [boxXmax, setBoxXmax] = useState(800);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSuccessJobId, setAiSuccessJobId] = useState<string | null>(null);
  const [aiQuote, setAiQuote] = useState<{
    estimatedCredits: string;
    estimatedOmr: string;
    canAfford: boolean;
    canSpend: boolean;
  } | null>(null);
  const [aiQuotePending, setAiQuotePending] = useState(false);
  const [aiQuoteError, setAiQuoteError] = useState<string | null>(null);

  // Layered Design Canvas states
  const [layers, setLayers] = useState<CanvasLayer[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(1024);
  const [canvasHeight, setCanvasHeight] = useState(1024);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isExportingPsd, setIsExportingPsd] = useState(false);
  const [layerError, setLayerError] = useState<string | null>(null);

  // Pixel Transform states (Sharp non-AI)
  const [kind, setKind] = useState<PixelEditKind>("crop");
  const [format, setFormat] = useState<"png" | "jpeg" | "webp">("png");
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [factor, setFactor] = useState<0.25 | 0.5 | 0.75 | 2 | 4>(2);
  const [fit, setFit] = useState<"contain" | "cover" | "fill">("contain");
  const [pixelCrop, setPixelCrop] = useState({ x: 0, y: 0 });
  const [pixelZoom, setPixelZoom] = useState(1);
  const [pixelRotation, setPixelRotation] = useState<QuarterTurn>(0);
  const [pixelFlipX, setPixelFlipX] = useState(false);
  const [pixelAspect, setPixelAspect] = useState<PixelAspect>("original");
  const [pixelArea, setPixelArea] = useState<MediaCropArea | null>(null);
  const [outputWidth, setOutputWidth] = useState(1024);
  const [outputHeight, setOutputHeight] = useState(1024);
  const [outputSizeDirty, setOutputSizeDirty] = useState(false);
  const [clientBusy, setClientBusy] = useState(false);
  const [clientMessage, setClientMessage] = useState<string | null>(null);
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
  const originalPixelAspect =
    (pixelRotation === 90 || pixelRotation === 270
      ? (selected?.height ?? 1) / (selected?.width ?? 1)
      : (selected?.width ?? 1) / (selected?.height ?? 1)) || 1;
  const pixelAspectValue =
    pixelAspect === "original"
      ? originalPixelAspect
      : PIXEL_ASPECTS[pixelAspect];
  const aiCreditsLabel = aiQuote?.estimatedCredits
    ? `${aiQuote.estimatedCredits} credits`
    : "Live quote";

  function initLayerForAsset(asset: Asset) {
    const w = asset.width ?? 1024;
    const h = asset.height ?? 1024;
    setCanvasWidth(w);
    setCanvasHeight(h);
    setAiRatio(nearestAiRatio(w, h));
    setWidth(w);
    setHeight(h);
    setOutputWidth(w);
    setOutputHeight(h);
    setOutputSizeDirty(false);
    setLayers([
      {
        id: `layer-${asset.id}`,
        name: asset.name ?? "Base Image",
        assetId: asset.id,
        imageUrl: `/api/assets/${asset.id}`,
        top: 0,
        left: 0,
        width: w,
        height: h,
        opacity: 255,
        visible: true,
        blendMode: "norm",
      },
    ]);
    setActiveLayerId(`layer-${asset.id}`);
  }

  // Load asset library
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
            const matched = data.assets.find(
              (asset) => asset.id === initialAssetId,
            );
            if (matched) {
              setSelectedId((current) => current || matched.id);
              initLayerForAsset(matched);
            } else {
              void fetch(
                `/api/assets?organizationId=${encodeURIComponent(organizationId)}&mediaKind=IMAGE&assetId=${encodeURIComponent(initialAssetId)}`,
                { cache: "no-store" },
              )
                .then(async (response) =>
                  response.ok
                    ? (response.json() as Promise<{ assets: Asset[] }>)
                    : { assets: [] },
                )
                .then((res) => {
                  if (active && res.assets[0]) {
                    setAssets((previous) => [res.assets[0]!, ...previous]);
                    setSelectedId((current) => current || initialAssetId);
                    initLayerForAsset(res.assets[0]!);
                  }
                })
                .catch(() => {
                  if (active) setError("Source image could not be loaded.");
                });
            }
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

  // Composite layers to canvas preview
  useEffect(() => {
    if (workspaceMode !== "layers") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let isMounted = true;
    const render = async () => {
      for (const layer of layers) {
        if (!layer.visible || !isMounted) continue;
        ctx.save();
        ctx.globalAlpha = layer.opacity / 255;
        if (layer.blendMode === "mul ")
          ctx.globalCompositeOperation = "multiply";
        else if (layer.blendMode === "scrn")
          ctx.globalCompositeOperation = "screen";
        else if (layer.blendMode === "over")
          ctx.globalCompositeOperation = "overlay";
        else ctx.globalCompositeOperation = "source-over";

        if (layer.color) {
          ctx.fillStyle = layer.color;
          ctx.fillRect(layer.left, layer.top, layer.width, layer.height);
        } else if (layer.imageUrl) {
          await new Promise<void>((resolve) => {
            const img = new window.Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
              if (isMounted) {
                ctx.drawImage(
                  img,
                  layer.left,
                  layer.top,
                  layer.width,
                  layer.height,
                );
              }
              resolve();
            };
            // Preview rendering is best-effort; PSD export below fails closed.
            img.onerror = () => resolve();
            img.src = layer.imageUrl!;
          });
        }
        ctx.restore();
      }
    };

    void render();
    return () => {
      isMounted = false;
    };
  }, [layers, workspaceMode, canvasWidth, canvasHeight]);

  useEffect(() => {
    if (!selected || !canGenerate || workspaceMode !== "ai") return;

    const controller = new AbortController();

    const timer = window.setTimeout(() => {
      setAiQuotePending(true);
      setAiQuoteError(null);
      void fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          organizationId,
          modelId: "dola-seedream-5-0-pro-260628",
          units: 1,
          resolution: aiResolution,
          aspectRatio: aiRatio,
          referenceAssetIds: [selected.id],
        }),
      })
        .then(async (response) => {
          const body = (await response.json()) as {
            quote?: {
              estimatedCredits: string;
              estimatedOmr: string;
            };
            wallet?: { canAfford: boolean };
            budget?: { canSpend: boolean };
            error?: string;
          };
          if (!response.ok || !body.quote) {
            throw new Error(body.error ?? "Live quote is unavailable.");
          }
          setAiQuote({
            estimatedCredits: body.quote.estimatedCredits,
            estimatedOmr: body.quote.estimatedOmr,
            canAfford: body.wallet?.canAfford ?? true,
            canSpend: body.budget?.canSpend ?? true,
          });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setAiQuote(null);
          setAiQuoteError(
            error instanceof Error
              ? error.message
              : "Live quote is unavailable.",
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) setAiQuotePending(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    aiRatio,
    aiResolution,
    canGenerate,
    organizationId,
    selected,
    workspaceMode,
  ]);

  // Poll operation status for pixel transforms
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
    if (asset) {
      initLayerForAsset(asset);
    }
    setX(0);
    setY(0);
    setWidth(asset?.width ?? 1024);
    setHeight(asset?.height ?? 1024);
    setOutputWidth(asset?.width ?? 1024);
    setOutputHeight(asset?.height ?? 1024);
    setOutputSizeDirty(false);
    setPixelCrop({ x: 0, y: 0 });
    setPixelZoom(1);
    setPixelRotation(0);
    setPixelFlipX(false);
    setPixelAspect("original");
    setPixelArea(null);
    setClientMessage(null);
    setResult(null);
    setError(null);
    setAttempt(null);
    setAiSuccessJobId(null);
    setAiError(null);
    setAiQuote(null);
    setAiQuotePending(false);
    setAiQuoteError(null);
  }

  // Submit AI precision edit with Seedream 5.0 Pro.
  async function submitAiEdit() {
    if (!selected || aiBusy || !canGenerate) return;
    setAiBusy(true);
    setAiError(null);
    setAiSuccessJobId(null);

    try {
      const description = aiPrompt.trim();
      if (!description) {
        throw new Error("Describe the edit you want Seedream 5.0 Pro to make.");
      }
      if (
        (aiTool === "inpaint" || aiTool === "replace") &&
        (boxXmin < 0 ||
          boxYmin < 0 ||
          boxXmax > 999 ||
          boxYmax > 999 ||
          boxXmin >= boxXmax ||
          boxYmin >= boxYmax)
      ) {
        throw new Error(
          "Target coordinates must stay within 0–999 and X1/Y1 must be smaller than X2/Y2.",
        );
      }

      // BytePlus interactive editing uses <bbox>x1 y1 x2 y2</bbox>.
      let finalPrompt = description;
      if (aiTool === "inpaint") {
        finalPrompt = `${description} in <bbox>${boxXmin} ${boxYmin} ${boxXmax} ${boxYmax}</bbox>`;
      } else if (aiTool === "replace") {
        finalPrompt = `Replace the object in <bbox>${boxXmin} ${boxYmin} ${boxXmax} ${boxYmax}</bbox> with ${description}`;
      } else {
        finalPrompt = `Seamlessly expand and outpaint the scene: ${description}`;
      }

      const quoteRes = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          modelId: "dola-seedream-5-0-pro-260628",
          units: 1,
          resolution: aiResolution,
          aspectRatio: aiRatio,
          referenceAssetIds: [selected.id],
        }),
      });

      const quoteData = (await quoteRes.json()) as {
        quote?: {
          quoteToken: string;
          modelId: string;
          priceVersionId: string;
          estimatedCredits: string;
          estimatedOmr: string;
        };
        wallet?: { canAfford: boolean };
        budget?: { canSpend: boolean };
        error?: string;
      };

      if (!quoteRes.ok || !quoteData.quote) {
        throw new Error(
          quoteData.error ??
            "Failed to obtain price quote for Seedream 5.0 Pro.",
        );
      }

      const canAfford = quoteData.wallet?.canAfford ?? true;
      const canSpend = quoteData.budget?.canSpend ?? true;
      setAiQuote({
        estimatedCredits: quoteData.quote.estimatedCredits,
        estimatedOmr: quoteData.quote.estimatedOmr,
        canAfford,
        canSpend,
      });
      if (!canSpend) {
        throw new Error(
          "This edit exceeds your monthly generation spending cap.",
        );
      }
      if (!canAfford) {
        throw new Error(
          "This workspace does not have enough credits for this edit.",
        );
      }

      const genRes = await fetch("/api/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          modelId: quoteData.quote.modelId,
          priceVersionId: quoteData.quote.priceVersionId,
          prompt: finalPrompt,
          resolution: aiResolution,
          aspectRatio: aiRatio,
          outputCount: 1,
          referenceAssetIds: [selected.id],
          quoteToken: quoteData.quote.quoteToken,
          idempotencyKey: crypto.randomUUID(),
        }),
      });

      const genData = (await genRes.json()) as {
        jobId?: string;
        error?: string;
      };

      if (!genRes.ok || !genData.jobId) {
        throw new Error(
          genData.error ?? "AI precision edit job could not be submitted.",
        );
      }

      setAiSuccessJobId(genData.jobId);
    } catch (err) {
      setAiError(
        err instanceof Error ? err.message : "AI edit could not be completed.",
      );
    } finally {
      setAiBusy(false);
    }
  }

  // Export layers to Adobe Photoshop (.psd)
  async function exportPsd() {
    if (!layers.length || isExportingPsd) return;
    setIsExportingPsd(true);
    setLayerError(null);

    try {
      validatePsdExportLayout({
        width: canvasWidth,
        height: canvasHeight,
        layers,
      });
      const psdLayers: PsdLayerInput[] = [];

      for (const layer of layers) {
        const offCanvas = document.createElement("canvas");
        offCanvas.width = layer.width;
        offCanvas.height = layer.height;
        const offCtx = offCanvas.getContext("2d");
        if (!offCtx) continue;

        if (layer.color) {
          offCtx.fillStyle = layer.color;
          offCtx.fillRect(0, 0, layer.width, layer.height);
        } else if (layer.imageUrl) {
          await new Promise<void>((resolve, reject) => {
            const img = new window.Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
              offCtx.drawImage(img, 0, 0, layer.width, layer.height);
              resolve();
            };
            img.onerror = () =>
              reject(new Error(`Could not load layer "${layer.name}".`));
            img.src = layer.imageUrl!;
          });
        }

        const imgData = offCtx.getImageData(0, 0, layer.width, layer.height);
        psdLayers.push({
          name: layer.name,
          width: layer.width,
          height: layer.height,
          top: layer.top,
          left: layer.left,
          opacity: layer.opacity,
          visible: layer.visible,
          blendMode: layer.blendMode,
          rgbaData: imgData.data,
        });
      }

      downloadPsdFile(`${selected?.name ?? "layer-design"}-layered.psd`, {
        width: canvasWidth,
        height: canvasHeight,
        layers: psdLayers,
      });
    } catch (err) {
      setLayerError(
        err instanceof Error ? err.message : "Failed to compile PSD binary.",
      );
    } finally {
      setIsExportingPsd(false);
    }
  }

  // Download flattened composite PNG without a base64 memory copy.
  async function downloadCompositePng() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setLayerError(null);
    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => {
          if (value) resolve(value);
          else reject(new Error("Could not encode flattened PNG."));
        }, "image/png");
      });
      const url = URL.createObjectURL(blob);
      try {
        const a = document.createElement("a");
        a.download = `${selected?.name ?? "composite"}-flattened.png`;
        a.href = url;
        a.click();
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setLayerError(
        err instanceof Error ? err.message : "Failed to export flattened PNG.",
      );
    }
  }

  function resetBrowserPixelEdit() {
    if (!selected) return;
    const w = selected.width ?? 1024;
    const h = selected.height ?? 1024;
    setPixelCrop({ x: 0, y: 0 });
    setPixelZoom(1);
    setPixelRotation(0);
    setPixelFlipX(false);
    setPixelAspect("original");
    setPixelArea(null);
    setOutputWidth(w);
    setOutputHeight(h);
    setOutputSizeDirty(false);
    setClientMessage(null);
    setError(null);
  }

  async function saveBrowserPixelEdit() {
    if (!selected || !pixelArea || clientBusy || !canEdit) return;
    setClientBusy(true);
    setClientMessage("Rendering on this device…");
    setError(null);
    setResult(null);
    try {
      const blob = await renderImageEdit({
        sourceUrl: `/api/assets/${selected.id}`,
        crop: pixelArea,
        rotation: pixelRotation,
        flipX: pixelFlipX,
        outputWidth,
        outputHeight,
        format,
      });
      const extension = format === "jpeg" ? "jpg" : format;
      const baseName = (selected.name ?? "edited-image")
        .replace(/\.[^.]+$/, "")
        .slice(0, 140);
      const file = new File([blob], `${baseName}-edited.${extension}`, {
        type: blob.type,
      });
      const form = new FormData();
      form.set("organizationId", organizationId);
      form.set("file", file);
      const response = await fetch("/api/assets/upload", {
        method: "POST",
        body: form,
      });
      const body = (await response.json()) as {
        asset?: { id: string };
        error?: string;
      };
      if (!response.ok || !body.asset)
        throw new Error(body.error ?? "Edited image could not be saved.");
      setResult({ id: body.asset.id, status: "Ready" });
      setClientMessage("Saved as a new asset. The original is unchanged.");
    } catch (cause) {
      setClientMessage(
        "Browser export was unavailable. The compatibility server tools below remain available.",
      );
      setError(
        cause instanceof Error
          ? cause.message
          : "Edited image could not be saved.",
      );
    } finally {
      setClientBusy(false);
    }
  }

  // Submit Sharp pixel transform
  async function submitPixelEdit() {
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

  // Layer stack helpers
  function addSolidLayer() {
    const id = `layer-solid-${crypto.randomUUID()}`;
    const newLayer: CanvasLayer = {
      id,
      name: `Solid Tint ${layers.length + 1}`,
      top: 0,
      left: 0,
      width: canvasWidth,
      height: canvasHeight,
      opacity: 80,
      visible: true,
      blendMode: "over",
      color: "rgba(235, 94, 40, 0.5)",
    };
    setLayers((prev) => [...prev, newLayer]);
    setActiveLayerId(id);
  }

  function addImageLayer(assetId: string) {
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) return;
    const id = `layer-asset-${crypto.randomUUID()}`;
    const newLayer: CanvasLayer = {
      id,
      name: asset.name ?? `Layer ${layers.length + 1}`,
      assetId: asset.id,
      imageUrl: `/api/assets/${asset.id}`,
      top: 0,
      left: 0,
      width: asset.width ?? canvasWidth,
      height: asset.height ?? canvasHeight,
      opacity: 255,
      visible: true,
      blendMode: "norm",
    };
    setLayers((prev) => [...prev, newLayer]);
    setActiveLayerId(id);
  }

  function moveLayer(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index + 1 : index - 1;
    if (targetIndex < 0 || targetIndex >= layers.length) return;
    const next = [...layers];
    const temp = next[index]!;
    next[index] = next[targetIndex]!;
    next[targetIndex] = temp;
    setLayers(next);
  }

  function removeLayer(id: string) {
    setLayers((prev) => prev.filter((l) => l.id !== id));
    if (activeLayerId === id) setActiveLayerId(null);
  }

  return (
    <section
      id="image-editor"
      className="paper-sheet relative rounded-[28px] border border-border p-5 sm:p-7"
      aria-label="Image editor desk"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <Eyebrow>Precision image studio</Eyebrow>
          <h2 className="font-display mt-1 text-2xl font-semibold text-foreground">
            Edit, layer, and craft.
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Use Seedream 5.0 Pro for coordinate-guided generative edits, compose
            assets in a multi-layer canvas with Photoshop PSD export, or perform
            deterministic pixel transforms.
          </p>
        </div>

        {/* Primary Workspace Mode Selector */}
        <div
          role="tablist"
          aria-label="Editor workspace mode"
          className="flex rounded-2xl border border-border bg-surface-sunken p-1.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={workspaceMode === "ai"}
            onClick={() => setWorkspaceMode("ai")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
              workspaceMode === "ai"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon name="sparkles" className="size-4 text-primary" />
            AI Precision Studio
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={workspaceMode === "layers"}
            onClick={() => setWorkspaceMode("layers")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
              workspaceMode === "layers"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon name="assets" className="size-4 text-primary" />
            Layered Canvas & PSD
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={workspaceMode === "pixel"}
            onClick={() => setWorkspaceMode("pixel")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
              workspaceMode === "pixel"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon name="image" className="size-4 text-primary" />
            Pixel Transform
          </button>
        </div>
      </div>

      <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.9fr)]">
        {/* Left Column: Visual Canvas / Interactive Preview */}
        <div className="relative min-w-0 rounded-2xl border border-border bg-surface-sunken p-4">
          {workspaceMode === "pixel" && selected ? (
            <MediaCropper
              key={`${selected.id}:${pixelAspect}`}
              kind="image"
              src={`/api/assets/${selected.id}`}
              crop={pixelCrop}
              zoom={pixelZoom}
              rotation={pixelRotation}
              flipX={pixelFlipX}
              aspect={pixelAspectValue}
              onCropChange={setPixelCrop}
              onZoomChange={setPixelZoom}
              onCropComplete={(_area, pixels) => {
                setPixelArea(pixels);
                setX(Math.max(0, Math.round(pixels.x)));
                setY(Math.max(0, Math.round(pixels.y)));
                setWidth(Math.max(1, Math.round(pixels.width)));
                setHeight(Math.max(1, Math.round(pixels.height)));
                if (!outputSizeDirty) {
                  setOutputWidth(Math.max(1, Math.round(pixels.width)));
                  setOutputHeight(Math.max(1, Math.round(pixels.height)));
                }
              }}
            />
          ) : workspaceMode === "layers" ? (
            <div className="relative mx-auto flex min-h-[480px] items-center justify-center overflow-hidden rounded-xl bg-card/60 p-2">
              <canvas
                ref={canvasRef}
                width={canvasWidth}
                height={canvasHeight}
                className="max-h-[480px] w-auto max-w-full rounded-lg object-contain shadow-md"
              />
            </div>
          ) : selected ? (
            <div className="flex max-h-[500px] justify-center">
              <div className="relative inline-block max-h-[500px] max-w-full">
                <Image
                  src={`/api/assets/${selected.id}`}
                  alt={selected.name ?? "Source image"}
                  width={selected.width ?? 1024}
                  height={selected.height ?? 1024}
                  unoptimized
                  className="block h-auto max-h-[500px] w-auto max-w-full rounded-xl object-contain"
                />
                {/* Interactive Bounding Box Overlay for AI Inpainting / Replace */}
                {workspaceMode === "ai" &&
                (aiTool === "inpaint" || aiTool === "replace") ? (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute border-2 border-dashed border-primary bg-primary/20 shadow-lg"
                    style={{
                      top: `${(boxYmin / 999) * 100}%`,
                      left: `${(boxXmin / 999) * 100}%`,
                      height: `${((boxYmax - boxYmin) / 999) * 100}%`,
                      width: `${((boxXmax - boxXmin) / 999) * 100}%`,
                    }}
                  >
                    <span className="absolute -top-6 left-0 rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                      Edit Region &lt;bbox&gt;
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="grid min-h-64 place-items-center text-sm text-muted-foreground">
              Choose a source image to begin editing.
            </div>
          )}

          {selected ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {selected.width} × {selected.height} px ·{" "}
                {selected.name ?? "Untitled"}
              </span>
              {workspaceMode === "ai" ? (
                <span className="font-semibold text-primary">
                  Powered by Seedream 5.0 Pro
                </span>
              ) : workspaceMode === "layers" ? (
                <span className="font-semibold text-primary">
                  {layers.length} {layers.length === 1 ? "layer" : "layers"}{" "}
                  active
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Right Column: Controls & Inspector */}
        <div className="space-y-5">
          <label className="grid gap-2 text-sm font-semibold text-foreground">
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

          {/* ============================================================ */}
          {/* TAB 1: AI PRECISION STUDIO (Seedream 5.0 Pro)                 */}
          {/* ============================================================ */}
          {workspaceMode === "ai" ? (
            <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-primary">
                  Seedream 5.0 Pro AI Tool
                </span>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                  {aiQuotePending ? "Quoting…" : aiCreditsLabel}
                </span>
              </div>

              {/* AI Tool Sub-Selector */}
              <div
                className="grid grid-cols-3 gap-2"
                role="group"
                aria-label="AI Tool"
              >
                {(
                  [
                    ["inpaint", "Generative Fill"],
                    ["replace", "Object Replace"],
                    ["outpaint", "Outpaint Expand"],
                  ] as const
                ).map(([tId, label]) => (
                  <button
                    key={tId}
                    type="button"
                    onClick={() => setAiTool(tId)}
                    className={`rounded-xl border p-2 text-center text-xs font-semibold transition ${
                      aiTool === tId
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Bounding Box Coordinates (Inpaint & Replace) */}
              {aiTool === "inpaint" || aiTool === "replace" ? (
                <div className="space-y-2 rounded-xl border border-border bg-surface-sunken p-3">
                  <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                    <span>Target Region &lt;bbox&gt; (0–999 Scale)</span>
                    <span className="text-[11px] text-muted-foreground">
                      Coordinates: [{boxXmin}, {boxYmin}, {boxXmax}, {boxYmax}]
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <label className="grid gap-1 text-[10px] font-semibold text-muted-foreground">
                      X1
                      <input
                        type="number"
                        min={0}
                        max={999}
                        value={boxXmin}
                        onChange={(e) =>
                          setBoxXmin(
                            Math.min(
                              999,
                              Math.max(0, Number(e.target.value) || 0),
                            ),
                          )
                        }
                        className="min-h-9 rounded-lg border border-input bg-card px-2 text-xs text-foreground"
                      />
                    </label>
                    <label className="grid gap-1 text-[10px] font-semibold text-muted-foreground">
                      Y1
                      <input
                        type="number"
                        min={0}
                        max={999}
                        value={boxYmin}
                        onChange={(e) =>
                          setBoxYmin(
                            Math.min(
                              999,
                              Math.max(0, Number(e.target.value) || 0),
                            ),
                          )
                        }
                        className="min-h-9 rounded-lg border border-input bg-card px-2 text-xs text-foreground"
                      />
                    </label>
                    <label className="grid gap-1 text-[10px] font-semibold text-muted-foreground">
                      X2
                      <input
                        type="number"
                        min={0}
                        max={999}
                        value={boxXmax}
                        onChange={(e) =>
                          setBoxXmax(
                            Math.min(
                              999,
                              Math.max(0, Number(e.target.value) || 0),
                            ),
                          )
                        }
                        className="min-h-9 rounded-lg border border-input bg-card px-2 text-xs text-foreground"
                      />
                    </label>
                    <label className="grid gap-1 text-[10px] font-semibold text-muted-foreground">
                      Y2
                      <input
                        type="number"
                        min={0}
                        max={999}
                        value={boxYmax}
                        onChange={(e) =>
                          setBoxYmax(
                            Math.min(
                              999,
                              Math.max(0, Number(e.target.value) || 0),
                            ),
                          )
                        }
                        className="min-h-9 rounded-lg border border-input bg-card px-2 text-xs text-foreground"
                      />
                    </label>
                  </div>

                  {/* Preset Region Buttons */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setBoxYmin(200);
                        setBoxXmin(200);
                        setBoxYmax(800);
                        setBoxXmax(800);
                      }}
                      className="rounded-lg border border-border bg-card px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                    >
                      Center Subject
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBoxYmin(0);
                        setBoxXmin(0);
                        setBoxYmax(450);
                        setBoxXmax(999);
                      }}
                      className="rounded-lg border border-border bg-card px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                    >
                      Top Background
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBoxYmin(550);
                        setBoxXmin(0);
                        setBoxYmax(999);
                        setBoxXmax(999);
                      }}
                      className="rounded-lg border border-border bg-card px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                    >
                      Bottom Foreground
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBoxYmin(0);
                        setBoxXmin(0);
                        setBoxYmax(999);
                        setBoxXmax(999);
                      }}
                      className="rounded-lg border border-border bg-card px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                    >
                      Full Image
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Outpaint Target Aspect Ratio */}
              {aiTool === "outpaint" ? (
                <label className="grid gap-1.5 text-xs font-semibold text-foreground">
                  Expand Target Aspect Ratio
                  <select
                    value={aiRatio}
                    onChange={(e) =>
                      setAiRatio(e.target.value as typeof aiRatio)
                    }
                    className="min-h-10 rounded-xl border border-input bg-card px-3 text-xs text-foreground"
                  >
                    <option value="16:9">Widescreen (16:9)</option>
                    <option value="21:9">Ultrawide (21:9)</option>
                    <option value="9:16">Portrait (9:16)</option>
                    <option value="1:1">Square (1:1)</option>
                    <option value="4:3">Standard (4:3)</option>
                    <option value="3:4">Vertical (3:4)</option>
                    <option value="3:2">Landscape Photo (3:2)</option>
                    <option value="2:3">Portrait Photo (2:3)</option>
                  </select>
                </label>
              ) : null}

              {/* Prompt Input */}
              <label className="grid gap-1.5 text-xs font-semibold text-foreground">
                {aiTool === "inpaint"
                  ? "Generative Fill Prompt"
                  : aiTool === "replace"
                    ? "Replacement Description"
                    : "Expand Scene Prompt"}
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  rows={3}
                  placeholder={
                    aiTool === "inpaint"
                      ? "Describe what to add or modify inside the target box…"
                      : aiTool === "replace"
                        ? "e.g., an artisanal vintage leather briefcase…"
                        : "e.g., extend lush mountain peaks and golden sunset sky…"
                  }
                  className="w-full rounded-xl border border-input bg-card p-3 text-xs text-foreground placeholder:text-muted-foreground"
                />
              </label>

              {/* Resolution Tier */}
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ["1K", "1K", "Provider base tier"],
                    ["1.5K", "1.5K · Recommended", "Same provider tier as 1K"],
                    ["2K", "2K · Maximum", "Higher provider tier"],
                  ] as const
                ).map(([value, label, price]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setAiResolution(value)}
                    className={`rounded-xl border p-2.5 text-left transition ${
                      aiResolution === value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground"
                    }`}
                  >
                    <div className="text-xs font-bold">{label}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {price} / output
                    </div>
                  </button>
                ))}
              </div>

              <div
                className="rounded-xl border border-border bg-surface-sunken px-3 py-2 text-xs text-muted-foreground"
                aria-live="polite"
              >
                {aiQuotePending
                  ? "Refreshing price…"
                  : aiQuote
                    ? `Estimated charge: ${aiQuote.estimatedCredits} credits · ${aiQuote.estimatedOmr} OMR`
                    : "Price is calculated from the active model rate before submission."}
                {aiQuote?.canAfford === false ? (
                  <span className="mt-1 block font-semibold text-destructive">
                    Workspace balance is too low for this edit.
                  </span>
                ) : null}
                {aiQuote?.canSpend === false ? (
                  <span className="mt-1 block font-semibold text-destructive">
                    This edit exceeds your monthly spending cap.
                  </span>
                ) : null}
                {aiQuoteError ? (
                  <span className="mt-1 block text-destructive">
                    {aiQuoteError}
                  </span>
                ) : null}
              </div>

              {/* Submit AI Edit Button */}
              <Button
                type="button"
                className="w-full"
                disabled={
                  !selected ||
                  aiBusy ||
                  !canGenerate ||
                  aiQuotePending ||
                  aiQuote?.canAfford === false ||
                  aiQuote?.canSpend === false
                }
                onClick={() => void submitAiEdit()}
              >
                {aiBusy ? (
                  "Generating with Seedream 5.0 Pro…"
                ) : (
                  <>
                    <Icon name="sparkles" className="mr-2 size-4" />
                    Run AI Precision Edit (
                    {aiQuote?.estimatedCredits
                      ? `${aiQuote.estimatedCredits} credits`
                      : "live quote"}
                    )
                  </>
                )}
              </Button>

              {aiError ? (
                <p
                  role="alert"
                  className="rounded-xl border border-destructive p-3 text-xs text-destructive"
                >
                  {aiError}
                </p>
              ) : null}

              {aiSuccessJobId ? (
                <div
                  role="status"
                  className="rounded-xl border border-success/30 bg-success/10 p-4 text-xs text-foreground"
                >
                  <p className="font-semibold text-success">
                    AI precision generation queued!
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Job ID: {aiSuccessJobId}. Your edit will appear in your
                    organization Asset Library when completed.
                  </p>
                  <div className="mt-2 flex gap-3">
                    <Link
                      href={`/app/${organizationSlug}/history/${aiSuccessJobId}`}
                      className="font-semibold text-primary underline"
                    >
                      Track Job Progress
                    </Link>
                    <Link
                      href={`/app/${organizationSlug}/assets`}
                      className="font-semibold text-primary underline"
                    >
                      View Asset Library
                    </Link>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* ============================================================ */}
          {/* TAB 2: LAYERED DESIGN CANVAS & PSD EXPORT                     */}
          {/* ============================================================ */}
          {workspaceMode === "layers" ? (
            <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-primary">
                  Multi-Layer Stack
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={addSolidLayer}
                    className="rounded-lg border border-border bg-surface-sunken px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-card"
                  >
                    + Add Tint Layer
                  </button>
                </div>
              </div>

              {/* Layer Stack Items */}
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {layers.map((layer, index) => (
                  <div
                    key={layer.id}
                    onClick={() => setActiveLayerId(layer.id)}
                    className={`rounded-xl border p-2.5 text-xs transition ${
                      activeLayerId === layer.id
                        ? "border-primary bg-primary/5"
                        : "border-border bg-surface-sunken"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLayers((prev) =>
                              prev.map((l) =>
                                l.id === layer.id
                                  ? { ...l, visible: !l.visible }
                                  : l,
                              ),
                            );
                          }}
                          aria-label={
                            layer.visible ? "Hide layer" : "Show layer"
                          }
                          className="text-muted-foreground hover:text-foreground"
                        >
                          {layer.visible ? "👁️" : "🚫"}
                        </button>
                        <span className="font-semibold text-foreground">
                          {layer.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            moveLayer(index, "up");
                          }}
                          disabled={index === layers.length - 1}
                          className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                          title="Move up"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            moveLayer(index, "down");
                          }}
                          disabled={index === 0}
                          className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                          title="Move down"
                        >
                          ▼
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeLayer(layer.id);
                          }}
                          disabled={layers.length <= 1}
                          className="rounded p-1 text-destructive hover:bg-destructive/10 disabled:opacity-30"
                          title="Remove layer"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* Active Layer Properties */}
                    {activeLayerId === layer.id ? (
                      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-2">
                        <label className="grid gap-1 text-[11px] font-semibold text-muted-foreground">
                          Opacity: {Math.round((layer.opacity / 255) * 100)}%
                          <input
                            type="range"
                            min={0}
                            max={255}
                            value={layer.opacity}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setLayers((prev) =>
                                prev.map((l) =>
                                  l.id === layer.id
                                    ? { ...l, opacity: val }
                                    : l,
                                ),
                              );
                            }}
                            className="accent-primary"
                          />
                        </label>

                        <label className="grid gap-1 text-[11px] font-semibold text-muted-foreground">
                          Blend Mode
                          <select
                            value={layer.blendMode}
                            onChange={(e) => {
                              const mode = e.target
                                .value as CanvasLayer["blendMode"];
                              setLayers((prev) =>
                                prev.map((l) =>
                                  l.id === layer.id
                                    ? { ...l, blendMode: mode }
                                    : l,
                                ),
                              );
                            }}
                            className="rounded-lg border border-input bg-card px-2 py-1 text-[11px]"
                          >
                            <option value="norm">Normal</option>
                            <option value="mul ">Multiply</option>
                            <option value="scrn">Screen</option>
                            <option value="over">Overlay</option>
                          </select>
                        </label>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              {/* Add Layer from Library */}
              <label className="grid gap-1.5 text-xs font-semibold text-foreground">
                Add Image Layer from Library
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) addImageLayer(e.target.value);
                  }}
                  className="min-h-10 rounded-xl border border-input bg-card px-3 text-xs text-foreground"
                >
                  <option value="">Choose asset to overlay…</option>
                  {assets
                    .filter((a) => a.id !== selectedId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name ?? "Untitled"} · {a.width}×{a.height}
                      </option>
                    ))}
                </select>
              </label>

              {/* PSD & Composite Export Buttons */}
              <div className="pt-2 space-y-2">
                <Button
                  type="button"
                  className="w-full"
                  disabled={!layers.length || isExportingPsd}
                  onClick={() => void exportPsd()}
                >
                  {isExportingPsd ? (
                    "Compiling Photoshop PSD…"
                  ) : (
                    <>
                      <Icon name="assets" className="mr-2 size-4" />
                      Export Multi-Layer PSD (.psd)
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  disabled={!layers.length}
                  onClick={() => void downloadCompositePng()}
                >
                  Download Composite PNG
                </Button>
              </div>

              {layerError ? (
                <p
                  role="alert"
                  className="rounded-xl border border-destructive p-3 text-xs text-destructive"
                >
                  {layerError}
                </p>
              ) : null}
            </div>
          ) : null}

          {/* ============================================================ */}
          {/* TAB 3: BROWSER-FIRST PIXEL EDITOR + SHARP FALLBACK          */}
          {/* ============================================================ */}
          {workspaceMode === "pixel" ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-lg font-semibold">
                      Quick image edit
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Crop, zoom, rotate, flip and resize in your browser.
                      Saving creates a new asset and leaves the original
                      untouched.
                    </p>
                  </div>
                  <span className="rounded-full border border-success/30 bg-success/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-success">
                    Device render
                  </span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-xs font-semibold">
                    Crop ratio
                    <select
                      value={pixelAspect}
                      onChange={(event) => {
                        setPixelAspect(event.target.value as PixelAspect);
                        setPixelCrop({ x: 0, y: 0 });
                        setPixelZoom(1);
                        setOutputSizeDirty(false);
                      }}
                      className="min-h-11 rounded-xl border border-input bg-background px-3"
                    >
                      <option value="original">Original</option>
                      <option value="1:1">1:1 square</option>
                      <option value="4:3">4:3 landscape</option>
                      <option value="16:9">16:9 widescreen</option>
                      <option value="9:16">9:16 vertical</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-semibold">
                    Zoom · {pixelZoom.toFixed(2)}×
                    <input
                      type="range"
                      min={1}
                      max={3}
                      step={0.01}
                      value={pixelZoom}
                      onChange={(event) =>
                        setPixelZoom(Number(event.target.value))
                      }
                      className="min-h-11 accent-current"
                    />
                  </label>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      setPixelRotation(
                        ((pixelRotation + 270) % 360) as QuarterTurn,
                      )
                    }
                  >
                    Rotate left
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      setPixelRotation(
                        ((pixelRotation + 90) % 360) as QuarterTurn,
                      )
                    }
                  >
                    Rotate right
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    aria-pressed={pixelFlipX}
                    onClick={() => setPixelFlipX((current) => !current)}
                  >
                    {pixelFlipX ? "Unflip" : "Flip horizontal"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={resetBrowserPixelEdit}
                  >
                    Reset
                  </Button>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <label className="grid gap-1 text-xs font-semibold">
                    Output width (px)
                    <input
                      type="number"
                      min={1}
                      max={8192}
                      value={outputWidth}
                      onChange={(event) => {
                        setOutputSizeDirty(true);
                        setOutputWidth(Number(event.target.value));
                      }}
                      className="min-h-11 rounded-xl border border-input bg-background px-3"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold">
                    Output height (px)
                    <input
                      type="number"
                      min={1}
                      max={8192}
                      value={outputHeight}
                      onChange={(event) => {
                        setOutputSizeDirty(true);
                        setOutputHeight(Number(event.target.value));
                      }}
                      className="min-h-11 rounded-xl border border-input bg-background px-3"
                    />
                  </label>
                </div>

                <label className="mt-3 grid gap-1 text-xs font-semibold">
                  Output format
                  <select
                    value={format}
                    onChange={(event) =>
                      setFormat(event.target.value as typeof format)
                    }
                    className="min-h-11 rounded-xl border border-input bg-background px-3"
                  >
                    <option value="png">PNG</option>
                    <option value="jpeg">JPEG</option>
                    <option value="webp">WebP</option>
                  </select>
                </label>

                <Button
                  type="button"
                  className="mt-4 w-full"
                  disabled={
                    !selected ||
                    !pixelArea ||
                    clientBusy ||
                    !canEdit ||
                    outputWidth < 1 ||
                    outputHeight < 1
                  }
                  onClick={() => void saveBrowserPixelEdit()}
                >
                  {clientBusy ? "Rendering on this device…" : "Save new image"}
                </Button>

                {clientMessage ? (
                  <p
                    role="status"
                    className="mt-3 text-xs leading-relaxed text-muted-foreground"
                  >
                    {clientMessage}
                  </p>
                ) : null}
              </div>

              <details className="rounded-2xl border border-border bg-card">
                <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
                  Compatibility server tools
                </summary>
                <div className="space-y-4 border-t border-border p-4">
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    These existing Sharp operations stay available as a
                    fallback. They use the media worker and are intentionally
                    separate from browser editing.
                  </p>
                  <div
                    className="flex flex-wrap gap-2"
                    role="group"
                    aria-label="Compatibility edit action"
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
                        className={`min-h-10 rounded-xl border px-4 text-sm font-semibold capitalize ${
                          kind === option
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background text-muted-foreground"
                        }`}
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
                      ).map(([label, val, setter]) => (
                        <label
                          key={label}
                          className="grid gap-1 text-xs font-semibold"
                        >
                          {label} (px)
                          <input
                            type="number"
                            min={label === "Left" || label === "Top" ? 0 : 1}
                            max={8192}
                            value={val}
                            onChange={(event) =>
                              setter(Number(event.target.value))
                            }
                            className="min-h-11 rounded-xl border border-input bg-background px-3"
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
                          onChange={(event) =>
                            setWidth(Number(event.target.value))
                          }
                          className="min-h-11 rounded-xl border border-input bg-background px-3"
                        />
                      </label>
                      <label className="grid gap-1 text-xs font-semibold">
                        Height (px)
                        <input
                          type="number"
                          min={1}
                          max={8192}
                          value={height}
                          onChange={(event) =>
                            setHeight(Number(event.target.value))
                          }
                          className="min-h-11 rounded-xl border border-input bg-background px-3"
                        />
                      </label>
                      <label className="col-span-2 grid gap-1 text-xs font-semibold">
                        Fit
                        <select
                          value={fit}
                          onChange={(event) =>
                            setFit(event.target.value as typeof fit)
                          }
                          className="min-h-11 rounded-xl border border-input bg-background px-3"
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
                        onChange={(event) =>
                          setFactor(Number(event.target.value) as typeof factor)
                        }
                        className="min-h-11 rounded-xl border border-input bg-background px-3"
                      >
                        {[0.25, 0.5, 0.75, 2, 4].map((value) => (
                          <option key={value} value={value}>
                            {value}× {value > 1 ? "upscale" : "downscale"}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    disabled={!selected || busy || !canEdit}
                    onClick={() => void submitPixelEdit()}
                  >
                    {busy
                      ? "Running compatibility edit…"
                      : "Run server transform"}
                  </Button>
                </div>
              </details>

              {operationId ? (
                <p role="status" className="text-sm text-muted-foreground">
                  Compatibility edit queued. This page will show the saved asset
                  when ready.
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
          ) : null}
        </div>
      </div>
    </section>
  );
}
