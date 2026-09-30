"use client";

import { countBillableCharacters } from "@aiwa/credits/pricing";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/creative";
import { StatusDot, Tape } from "@/components/ui/sketch";

type CapabilityValue = boolean | number | string;
type MediaKind = "IMAGE" | "VIDEO" | "VOICE";
type PresetVoice = {
  key: string;
  displayName: string;
  gender?: "female" | "male";
  locale: string;
  language: string;
  style?: string;
  supportedModels: string[];
};
type Model = {
  id: string;
  providerModelId: string;
  name: string;
  mediaKind: MediaKind;
  description?: string | null;
  priceVersionId: string;
  pricingDimension?: "REQUEST" | "CHARACTER" | "SECOND" | "TOKEN" | null;
  unitQuantity?: string | null;
  credits: string;
  capabilities?: Record<string, CapabilityValue> | null;
};
type ProjectOption = {
  id: string;
  name: string;
};
type ReferenceAsset = {
  id: string;
  name: string;
  width: number | null;
  height: number | null;
  durationMs?: number | null;
  mimeType?: string;
  byteSize?: string;
};
type Job = {
  id: string;
  status: string;
  errorMessage: string | null;
  reservedCredits: string;
  chargedCredits: string;
  providerModel: { displayName: string; mediaKind: MediaKind };
  project: ProjectOption | null;
  assets: { id: string; mimeType: string }[];
};
type Studio = {
  configured: boolean;
  mediaConfigured?: boolean;
  voiceConfigured?: boolean;
  balance: string;
  models: Model[];
  voices?: PresetVoice[];
  projects: ProjectOption[];
  jobs: Job[];
};
function statusLabel(status: string, mediaKind: MediaKind): string {
  const media =
    mediaKind === "VIDEO" ? "video" : mediaKind === "VOICE" ? "voice" : "image";
  const statuses: Record<string, string> = {
    QUEUED: "Queued",
    SUBMITTED: `Submitting ${media}`,
    PROCESSING:
      mediaKind === "VIDEO"
        ? "Rendering video"
        : mediaKind === "VOICE"
          ? "Synthesizing voice"
          : "Saving image",
    SUCCEEDED: "Ready",
    FAILED: "Failed — credits released",
    MANUAL_REVIEW: "Needs review — credits reserved",
    CANCELLED: "Cancelled",
  };
  return statuses[status] ?? status;
}

function capabilityValues(
  capabilities: Model["capabilities"],
  prefix: string,
): string[] {
  if (!capabilities) return [];
  const marker = `${prefix}:`;
  return Object.entries(capabilities)
    .filter(([key, value]) => key.startsWith(marker) && value === true)
    .map(([key]) => key.slice(marker.length));
}

interface StudioQuote {
  quoteToken: string;
  priceVersionId: string;
  expiresAt: string;
  estimatedCredits: string;
  estimatedOmr: string;
  reservationCredits: string;
  maximumChargeOmr: string;
  settlement: "FIXED" | "ACTUAL_USAGE";
  estimatedUsage: { unit: string; quantity: string; isEstimate: boolean };
}

const mediaModes = ["IMAGE", "VIDEO", "VOICE"] as const;

export function GenerationStudio({
  canGenerate,
  organizationId,
  organizationSlug,
  variant = "advanced",
  initialMode = "IMAGE",
}: {
  canGenerate: boolean;
  organizationId: string;
  organizationSlug: string;
  variant?: "quick" | "advanced";
  initialMode?: MediaKind;
}) {
  const [data, setData] = useState<Studio | null>(null);
  const [activeMode, setActiveMode] = useState<MediaKind>(initialMode);
  const [modelId, setModelId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [voiceText, setVoiceText] = useState("");
  const [voiceKey, setVoiceKey] = useState("jasper");
  const [speechRate, setSpeechRate] = useState(1.0);
  const [quoteState, setQuoteState] = useState<{
    key: string;
    quote: StudioQuote;
    canSpend: boolean;
    canAfford: boolean;
  } | null>(null);
  const [quotePending, setQuotePending] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteRefresh, setQuoteRefresh] = useState(0);
  const [ratio, setRatio] = useState("1:1");
  const [resolution, setResolution] = useState("2K");
  const [templateContext, setTemplateContext] = useState<{
    id: string;
    slug: string;
    name: string;
  } | null>(null);
  const [duration, setDuration] = useState("5");
  const [generateAudio, setGenerateAudio] = useState(false);
  const [references, setReferences] = useState<ReferenceAsset[]>([]);
  const [videoFrames, setVideoFrames] = useState<ReferenceAsset[]>([]);
  const [videoReferences, setVideoReferences] = useState<ReferenceAsset[]>([]);
  const [referenceVideoAssetId, setReferenceVideoAssetId] = useState("");
  const [referenceAssetIds, setReferenceAssetIds] = useState<string[]>([]);
  const [videoFirstFrameId, setVideoFirstFrameId] = useState("");
  const [videoLastFrameId, setVideoLastFrameId] = useState("");
  const [referenceBusy, setReferenceBusy] = useState(false);
  const [referenceUrl, setReferenceUrl] = useState("");
  const [outputCount, setOutputCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const consumedTemplateHandoff = useRef<string | null>(null);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const enhancementAttempt = useRef<{
    fingerprint: string;
    key: string;
  } | null>(null);

  const modelsForMode = useMemo(
    () => data?.models.filter((m) => m.mediaKind === activeMode) ?? [],
    [data?.models, activeMode],
  );

  const model = modelsForMode.find((m) => m.id === modelId) ?? modelsForMode[0];
  const maxImageOutputs = Math.min(
    Number(model?.capabilities?.maxGeneratedImages ?? 1),
    Number(model?.capabilities?.maxTotalInputOutputImages ?? 15) -
      referenceAssetIds.length,
  );
  const selectedOutputCount = Math.min(
    outputCount,
    Math.max(1, maxImageOutputs),
  );
  const selectedProjectId = (data?.projects ?? []).some(
    (project) => project.id === projectId,
  )
    ? projectId
    : "";

  const availableVoices = useMemo(
    () =>
      (data?.voices ?? []).filter(
        (voice) =>
          !model || voice.supportedModels.includes(model.providerModelId),
      ),
    [data?.voices, model],
  );
  const selectedVoiceKey = availableVoices.some(
    (voice) => voice.key === voiceKey,
  )
    ? voiceKey
    : (availableVoices[0]?.key ?? "");

  const availableRatios = useMemo(
    () => capabilityValues(model?.capabilities, "aspectRatio"),
    [model?.capabilities],
  );
  const availableResolutions = useMemo(
    () => capabilityValues(model?.capabilities, "resolution"),
    [model?.capabilities],
  );
  const availableDurations = useMemo(
    () => capabilityValues(model?.capabilities, "durationSeconds"),
    [model?.capabilities],
  );

  const selectedRatio =
    activeMode === "VIDEO" && videoFirstFrameId
      ? "adaptive"
      : availableRatios.includes(ratio)
        ? ratio
        : (availableRatios[0] ?? "");
  const selectedResolution = availableResolutions.includes(resolution)
    ? resolution
    : (availableResolutions[0] ?? "");
  const selectedDuration = availableDurations.includes(duration)
    ? duration
    : (availableDurations[0] ?? "5");
  const handleModeChange = useCallback(
    (mode: MediaKind) => {
      if (mode !== activeMode) {
        setTemplateContext(null);
        setReferenceAssetIds([]);
        setOutputCount(1);
      }
      setActiveMode(mode);
      setError(null);
      const nextModel = data?.models.find((m) => m.mediaKind === mode);
      if (nextModel) {
        setModelId(nextModel.id);
      }
    },
    [activeMode, data?.models],
  );

  const billableCharacters = countBillableCharacters(voiceText.trim());
  const unitQuantity = Number(model?.unitQuantity ?? 1000);
  const estimatedUnits =
    billableCharacters > 0 ? Math.ceil(billableCharacters / unitQuantity) : 0;
  const activeModelId = model?.id;
  const activePriceVersionId = model?.priceVersionId;
  const quoteRequestKey = JSON.stringify({
    organizationId,
    modelId: activeModelId,
    ...(activeMode === "VOICE"
      ? { text: voiceText }
      : { aspectRatio: selectedRatio, resolution: selectedResolution }),
    ...(activeMode === "IMAGE"
      ? { units: selectedOutputCount, referenceAssetIds }
      : {}),
    ...(activeMode === "VIDEO"
      ? {
          durationSeconds: Number(selectedDuration),
          generateAudio,
          ...(videoFirstFrameId
            ? { firstFrameAssetId: videoFirstFrameId }
            : {}),
          ...(videoLastFrameId ? { lastFrameAssetId: videoLastFrameId } : {}),
          ...(referenceVideoAssetId ? { referenceVideoAssetId } : {}),
        }
      : {}),
  });
  const activeQuote =
    quoteState?.key === quoteRequestKey &&
    quoteState.quote.priceVersionId === activePriceVersionId
      ? quoteState
      : null;
  useEffect(() => {
    if (!activeModelId || (activeMode === "VOICE" && !billableCharacters)) {
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setQuoteState(null);
      setQuotePending(true);
      setQuoteError(null);
      try {
        const res = await fetch("/api/quotes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: quoteRequestKey,
          signal: controller.signal,
        });
        const result = (await res.json()) as {
          error?: string;
          quote?: StudioQuote;
          budget?: { canSpend: boolean };
          wallet?: { canAfford: boolean };
        };
        if (controller.signal.aborted) return;
        if (!res.ok || !result.quote || !result.quote.quoteToken)
          throw new Error(result.error ?? "Quote is unavailable.");
        if (result.quote.priceVersionId !== activePriceVersionId)
          throw new Error("Model pricing changed. Refresh the Studio.");
        setQuoteState({
          key: quoteRequestKey,
          quote: result.quote,
          canSpend: result.budget?.canSpend === true,
          canAfford: result.wallet?.canAfford === true,
        });
      } catch (error) {
        if (!controller.signal.aborted)
          setQuoteError(
            error instanceof Error ? error.message : "Quote is unavailable.",
          );
      } finally {
        if (!controller.signal.aborted) setQuotePending(false);
      }
    }, 300);
    const refreshTimer = setTimeout(
      () => setQuoteRefresh((value) => value + 1),
      240000,
    );
    return () => {
      controller.abort();
      clearTimeout(timer);
      clearTimeout(refreshTimer);
    };
  }, [
    activeModelId,
    activePriceVersionId,
    activeMode,
    billableCharacters,
    quoteRequestKey,
    quoteRefresh,
  ]);
  const activeRequiredCredits = activeQuote
    ? BigInt(activeQuote.quote.reservationCredits)
    : null;

  const isConfiguredForMode =
    activeMode === "VOICE"
      ? Boolean(data?.voiceConfigured)
      : Boolean(data?.mediaConfigured ?? data?.configured);

  useEffect(() => {
    if (
      variant !== "advanced" ||
      (activeMode !== "IMAGE" && activeMode !== "VIDEO")
    )
      return;
    const controller = new AbortController();
    void fetch(
      `/api/assets/references?organizationId=${encodeURIComponent(organizationId)}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Reference library could not be loaded.");
        return response.json() as Promise<{ assets: ReferenceAsset[] }>;
      })
      .then((body) => setReferences(body.assets))
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : "Reference library unavailable.",
          );
      });
    return () => controller.abort();
  }, [activeMode, organizationId, variant]);
  useEffect(() => {
    if (
      variant !== "advanced" ||
      activeMode !== "VIDEO" ||
      model?.capabilities?.referenceVideo !== true
    )
      return;
    const controller = new AbortController();
    void fetch(
      `/api/assets?organizationId=${encodeURIComponent(organizationId)}&mediaKind=VIDEO&limit=100`,
      { signal: controller.signal, cache: "no-store" },
    )
      .then((response) =>
        response.ok
          ? (response.json() as Promise<{ assets: ReferenceAsset[] }>)
          : { assets: [] },
      )
      .then((body) =>
        setVideoReferences(
          body.assets.filter(
            (asset) =>
              asset.mimeType === "video/mp4" &&
              asset.durationMs !== null &&
              asset.durationMs !== undefined &&
              asset.durationMs >= 2_000 &&
              asset.durationMs <= 30_000 &&
              asset.width !== null &&
              asset.height !== null &&
              asset.width >= 300 &&
              asset.height >= 300 &&
              asset.width * asset.height >= 407_696 &&
              asset.width * asset.height <= 8_295_044 &&
              asset.width / asset.height >= 0.4 &&
              asset.width / asset.height <= 2.5 &&
              Number(asset.byteSize) <= 100_000_000,
          ),
        ),
      )
      .catch(() => {
        if (!controller.signal.aborted) setVideoReferences([]);
      });
    return () => controller.abort();
  }, [
    activeMode,
    organizationId,
    variant,
    model?.capabilities?.referenceVideo,
  ]);
  useEffect(() => {
    if (variant !== "advanced" || activeMode !== "VIDEO") return;
    const controller = new AbortController();
    void fetch(
      `/api/assets?organizationId=${encodeURIComponent(organizationId)}&mediaKind=IMAGE&limit=100`,
      { signal: controller.signal, cache: "no-store" },
    )
      .then((response) =>
        response.ok
          ? (response.json() as Promise<{ assets: ReferenceAsset[] }>)
          : { assets: [] },
      )
      .then((body) => setVideoFrames(body.assets))
      .catch(() => undefined);
    return () => controller.abort();
  }, [activeMode, organizationId, variant]);

  async function uploadReference(file: File) {
    if (referenceBusy || !canGenerate) return;
    setReferenceBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("organizationId", organizationId);
      form.set("file", file);
      const response = await fetch("/api/assets/references", {
        method: "POST",
        body: form,
      });
      const body = (await response.json()) as {
        asset?: ReferenceAsset;
        error?: string;
      };
      if (!response.ok || !body.asset)
        throw new Error(body.error ?? "Reference upload failed.");
      setReferences((previous) => [body.asset!, ...previous]);
      if (activeMode === "VIDEO") {
        setVideoFrames((previous) => [body.asset!, ...previous]);
        setVideoFirstFrameId(body.asset.id);
      } else setReferenceAssetIds((previous) => [...previous, body.asset!.id]);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Reference upload failed.",
      );
    } finally {
      setReferenceBusy(false);
    }
  }

  async function importReference() {
    if (referenceBusy || !canGenerate || !referenceUrl.trim()) return;
    setReferenceBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/assets/image-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, url: referenceUrl.trim() }),
      });
      const body = (await response.json()) as {
        asset?: ReferenceAsset;
        error?: string;
      };
      if (!response.ok || !body.asset)
        throw new Error(body.error ?? "Image import failed.");
      setReferences((previous) => [body.asset!, ...previous]);
      setReferenceAssetIds((previous) => [...previous, body.asset!.id]);
      setReferenceUrl("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Image import failed.");
    } finally {
      setReferenceBusy(false);
    }
  }

  const refresh = useCallback(async () => {
    const response = await fetch(
      `/api/generations?organizationId=${encodeURIComponent(organizationId)}`,
      { cache: "no-store" },
    );
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Cannot load Studio.");
    setData(body);
  }, [organizationId]);
  useEffect(() => {
    let stopped = false;
    const load = () =>
      refresh().catch(() => {
        if (!stopped)
          setError(
            "Connection interrupted. Job history will refresh automatically.",
          );
      });
    void load();
    const timer = setInterval(() => void load(), 4000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [refresh]);

  useEffect(() => {
    const handoffId = new URLSearchParams(window.location.search).get(
      "templateHandoff",
    );
    if (!handoffId || !data || consumedTemplateHandoff.current === handoffId) {
      return;
    }

    consumedTemplateHandoff.current = handoffId;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;

      const storageKey = `aiwa-template-handoff:${handoffId}`;
      const raw = sessionStorage.getItem(storageKey);
      sessionStorage.removeItem(storageKey);
      if (!raw) {
        setError("This template handoff expired. Open the template again.");
        return;
      }

      try {
        const resolved = JSON.parse(raw) as {
          templateId?: unknown;
          templateSlug?: unknown;
          templateName?: unknown;
          mediaKind?: unknown;
          prompt?: unknown;
          modelId?: unknown;
          referenceAssetIds?: unknown;
          defaults?: {
            aspectRatio?: unknown;
            resolution?: unknown;
            outputCount?: unknown;
            durationSeconds?: unknown;
            generateAudio?: unknown;
            voiceKey?: unknown;
            speechRate?: unknown;
          };
        };
        if (
          typeof resolved.templateId !== "string" ||
          typeof resolved.templateSlug !== "string" ||
          typeof resolved.templateName !== "string" ||
          !["IMAGE", "VIDEO", "VOICE"].includes(String(resolved.mediaKind)) ||
          typeof resolved.prompt !== "string" ||
          typeof resolved.modelId !== "string"
        ) {
          throw new Error("Invalid template handoff.");
        }

        const mediaKind = resolved.mediaKind as MediaKind;
        const selectedModel = data.models.find(
          (candidate) =>
            candidate.id === resolved.modelId &&
            candidate.mediaKind === mediaKind,
        );
        if (!selectedModel) {
          throw new Error(
            "The model selected for this template is no longer available.",
          );
        }

        setActiveMode(mediaKind);
        setModelId(selectedModel.id);
        setTemplateContext({
          id: resolved.templateId,
          slug: resolved.templateSlug,
          name: resolved.templateName,
        });

        if (mediaKind === "VOICE") {
          setVoiceText(resolved.prompt);
        } else {
          setPrompt(resolved.prompt);
        }

        const defaults = resolved.defaults ?? {};
        if (typeof defaults.aspectRatio === "string") {
          setRatio(defaults.aspectRatio);
        }
        if (typeof defaults.resolution === "string") {
          setResolution(defaults.resolution);
        }
        if (
          typeof defaults.outputCount === "number" &&
          Number.isInteger(defaults.outputCount)
        ) {
          setOutputCount(Math.max(1, Math.min(15, defaults.outputCount)));
        }
        if (
          typeof defaults.durationSeconds === "number" &&
          Number.isInteger(defaults.durationSeconds)
        ) {
          setDuration(String(defaults.durationSeconds));
        }
        if (typeof defaults.generateAudio === "boolean") {
          setGenerateAudio(defaults.generateAudio);
        }
        if (typeof defaults.voiceKey === "string") {
          setVoiceKey(defaults.voiceKey);
        }
        if (
          typeof defaults.speechRate === "number" &&
          defaults.speechRate >= 0.5 &&
          defaults.speechRate <= 2
        ) {
          setSpeechRate(defaults.speechRate);
        }
        if (
          Array.isArray(resolved.referenceAssetIds) &&
          resolved.referenceAssetIds.every((value) => typeof value === "string")
        ) {
          setReferenceAssetIds(resolved.referenceAssetIds);
        } else {
          setReferenceAssetIds([]);
        }

        setError(null);
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}#create`,
        );
      } catch (reason) {
        setTemplateContext(null);
        setReferenceAssetIds([]);
        setError(
          reason instanceof Error
            ? reason.message
            : "Template could not be opened in Studio.",
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [data]);
  async function generate() {
    if (!model || busy || isEnhancing || !activeQuote) return;
    setBusy(true);
    setError(null);
    let input: Record<string, unknown>;
    if (model.mediaKind === "VOICE") {
      input = {
        organizationId,
        projectId: selectedProjectId || null,
        modelId: model.id,
        priceVersionId: model.priceVersionId,
        text: voiceText.trim(),
        voiceKey: selectedVoiceKey,
        speechRate,
        format: "mp3",
        ...(templateContext ? { templateId: templateContext.id } : {}),
      };
    } else {
      input = {
        organizationId,
        projectId: selectedProjectId || null,
        modelId: model.id,
        priceVersionId: model.priceVersionId,
        prompt,
        aspectRatio: selectedRatio,
        resolution: selectedResolution,
        ...(model.mediaKind === "IMAGE" && {
          outputCount: selectedOutputCount,
          referenceAssetIds,
        }),
        ...(templateContext ? { templateId: templateContext.id } : {}),
        ...(model.mediaKind === "VIDEO" && {
          durationSeconds: Number.parseInt(selectedDuration, 10),
          generateAudio,
          ...(videoFirstFrameId
            ? { firstFrameAssetId: videoFirstFrameId }
            : {}),
          ...(videoLastFrameId ? { lastFrameAssetId: videoLastFrameId } : {}),
          ...(referenceVideoAssetId ? { referenceVideoAssetId } : {}),
        }),
      };
    }
    const fingerprint = JSON.stringify(input);
    if (attempt.current?.fingerprint !== fingerprint)
      attempt.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const response = await fetch("/api/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...input,
          quoteToken: activeQuote.quote.quoteToken,
          idempotencyKey: attempt.current.key,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Generation could not be queued.");
      // A successful 202 means the durable job exists. Keep the key if the
      // history refresh fails so a retry returns the same job without a
      // second charge or provider submission.
      try {
        await refresh();
        attempt.current = null;
      } catch {
        setError(
          "Creation queued. History is temporarily unavailable; retrying this request will return the same job.",
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Connection interrupted. Retry to check the same request.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function enhancePrompt() {
    const sourcePrompt = prompt.trim();
    if (!sourcePrompt || !model || isEnhancing || busy || !canGenerate) return;

    const fingerprint = JSON.stringify({
      organizationId,
      sourcePrompt,
      targetMedia: model.mediaKind,
    });
    if (enhancementAttempt.current?.fingerprint !== fingerprint)
      enhancementAttempt.current = {
        fingerprint,
        key: crypto.randomUUID(),
      };

    setIsEnhancing(true);
    setError(null);
    try {
      const response = await fetch("/api/reasoning/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          userPrompt: sourcePrompt,
          targetMedia: model.mediaKind,
          idempotencyKey: enhancementAttempt.current.key,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error ?? "Prompt enhancement could not be queued.",
        );

      const jobId = body.jobId as string;
      for (let attemptNumber = 0; attemptNumber < 45; attemptNumber += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const pollResponse = await fetch(`/api/reasoning/${jobId}`, {
          cache: "no-store",
        });
        const job = await pollResponse.json();
        if (!pollResponse.ok)
          throw new Error(
            job.error ?? "Prompt enhancement status unavailable.",
          );

        if (job.status === "SUCCEEDED") {
          const enhancedPrompt = job.outputPayload?.enhancedPrompt;
          if (typeof enhancedPrompt !== "string" || !enhancedPrompt.trim())
            throw new Error("Prompt enhancement returned an invalid result.");
          setPrompt(enhancedPrompt);
          enhancementAttempt.current = null;
          return;
        }
        if (job.status === "FAILED") {
          enhancementAttempt.current = null;
          throw new Error(job.errorMessage ?? "Prompt enhancement failed.");
        }
      }

      throw new Error("Prompt enhancement timed out. Retry the same request.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Prompt enhancement could not be completed.",
      );
    } finally {
      setIsEnhancing(false);
    }
  }

  return (
    <section
      id="create"
      className="paper-sheet relative rounded-[28px] border border-border p-5 sm:p-7"
    >
      <Tape className="-top-1 right-16 hidden rotate-6 sm:block" />
      <Eyebrow>
        {variant === "quick"
          ? "Quick create"
          : `${activeMode.toLowerCase()} studio`}
      </Eyebrow>
      <h2 className="font-display mt-2 text-2xl font-semibold text-foreground">
        Start with a rough idea.
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {variant === "quick"
          ? "One idea, one click. Your model and settings are ready for you."
          : "Shape every detail with verified BytePlus models."}
      </p>
      {variant === "quick" ? (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Need reference images, detailed settings, or editing? Open the
          dedicated{" "}
          <Link
            href={`/app/${organizationSlug}/image`}
            className="font-semibold text-primary hover:underline"
          >
            Image
          </Link>
          ,{" "}
          <Link
            href={`/app/${organizationSlug}/video`}
            className="font-semibold text-primary hover:underline"
          >
            Video
          </Link>
          , or{" "}
          <Link
            href={`/app/${organizationSlug}/speech`}
            className="font-semibold text-primary hover:underline"
          >
            Speech
          </Link>{" "}
          studio.
        </p>
      ) : null}
      {templateContext ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-primary/20 bg-primary/[0.06] px-4 py-3">
          <span className="grid size-8 place-items-center rounded-xl bg-primary/12 text-primary">
            ✦
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-foreground">
              {templateContext.name}
            </span>
            <span className="mt-0.5 block text-[10px] text-muted-foreground">
              Template applied · review or adjust anything before generation
            </span>
          </span>
          <Link
            href={`/app/${organizationSlug}/templates`}
            className="text-xs font-semibold text-primary"
          >
            Change template
          </Link>
        </div>
      ) : null}
      <div className="mt-4">
        <div
          role="tablist"
          aria-label="Media format"
          className="inline-flex rounded-xl border border-border bg-card p-1"
        >
          {(variant === "quick" ? mediaModes : [initialMode]).map(
            (mode, index) => (
              <button
                key={mode}
                id={`media-tab-${mode.toLowerCase()}`}
                type="button"
                role="tab"
                aria-selected={activeMode === mode}
                aria-controls="media-creation-panel"
                tabIndex={activeMode === mode ? 0 : -1}
                onClick={() => handleModeChange(mode)}
                onKeyDown={(event) => {
                  if (
                    !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                      event.key,
                    )
                  )
                    return;
                  event.preventDefault();
                  const nextIndex =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? (variant === "quick" ? mediaModes : [initialMode])
                            .length - 1
                        : (index +
                            (event.key === "ArrowRight" ? 1 : -1) +
                            (variant === "quick" ? mediaModes : [initialMode])
                              .length) %
                          (variant === "quick" ? mediaModes : [initialMode])
                            .length;
                  const nextMode = (
                    variant === "quick" ? mediaModes : [initialMode]
                  )[nextIndex]!;
                  handleModeChange(nextMode);
                  document
                    .getElementById(`media-tab-${nextMode.toLowerCase()}`)
                    ?.focus();
                }}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                  activeMode === mode
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {mode === "IMAGE"
                  ? "Image"
                  : mode === "VIDEO"
                    ? "Video"
                    : "Voice"}
              </button>
            ),
          )}
        </div>
      </div>
      <div
        id="media-creation-panel"
        role="tabpanel"
        aria-labelledby={`media-tab-${activeMode.toLowerCase()}`}
        className={`mt-6 grid gap-6 ${variant === "quick" ? "" : "lg:grid-cols-2"}`}
      >
        <div className="space-y-4">
          <div className={variant === "quick" ? "hidden" : "space-y-4"}>
            <label
              className="block text-sm font-semibold text-foreground"
              htmlFor="media-model"
            >
              Generation model
            </label>
            <select
              id="media-model"
              value={model?.id ?? ""}
              onChange={(e) => setModelId(e.target.value)}
              disabled={busy || isEnhancing}
              className="min-h-11 w-full rounded-xl border border-input bg-card px-3 text-foreground"
            >
              {!modelsForMode.length ? (
                <option>
                  No enabled {activeMode.toLowerCase()} models with active
                  pricing
                </option>
              ) : null}
              {modelsForMode.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ·{" "}
                  {m.pricingDimension === "TOKEN"
                    ? "Usage-based pricing"
                    : m.pricingDimension === "CHARACTER"
                      ? `${m.credits} credits / ${m.unitQuantity ?? 1000} chars`
                      : m.pricingDimension === "SECOND"
                        ? `${m.credits} credits / ${m.unitQuantity ?? 5}s`
                        : `${m.credits} credits`}
                </option>
              ))}
            </select>
            {model?.description ? (
              <p className="text-xs text-muted-foreground">
                {model.description}
              </p>
            ) : null}

            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-3">
                <label
                  className="text-sm font-semibold text-foreground"
                  htmlFor="generation-project"
                >
                  Project
                </label>
                <a
                  href={`/app/${organizationSlug}/projects`}
                  className="text-xs font-semibold text-primary"
                >
                  Manage projects
                </a>
              </div>
              <select
                id="generation-project"
                value={selectedProjectId}
                onChange={(event) => setProjectId(event.target.value)}
                disabled={busy || isEnhancing}
                className="min-h-11 w-full rounded-xl border border-input bg-card px-3 text-foreground"
              >
                <option value="">No project</option>
                {(data?.projects ?? []).map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-subtle-foreground">
                Optional. The generation and its output asset stay linked to the
                selected project.
              </p>
            </div>
          </div>

          {activeMode === "VOICE" ? (
            <>
              <label
                htmlFor="voice-text"
                className="block text-sm font-semibold text-foreground"
              >
                Speech synthesis text
              </label>
              <div className="relative">
                <textarea
                  id="voice-text"
                  value={voiceText}
                  onChange={(e) => setVoiceText(e.target.value)}
                  maxLength={4096}
                  disabled={busy}
                  placeholder="Enter clear, natural text for speech synthesis…"
                  className="min-h-44 w-full rounded-2xl border border-input bg-card p-4 pb-10 text-foreground placeholder:text-muted-foreground"
                />
                <div className="absolute bottom-3 right-3 text-xs text-muted-foreground">
                  {voiceText.length} / 4096 chars · {estimatedUnits} block
                  {estimatedUnits === 1 ? "" : "s"}
                </div>
              </div>

              <div className={variant === "quick" ? "hidden" : "space-y-4"}>
                <label
                  htmlFor="voice-preset"
                  className="block text-sm font-semibold text-foreground"
                >
                  Preset voice
                </label>
                <select
                  id="voice-preset"
                  value={selectedVoiceKey}
                  onChange={(e) => setVoiceKey(e.target.value)}
                  disabled={busy || availableVoices.length === 0}
                  className="min-h-11 w-full rounded-xl border border-input bg-card px-3 text-foreground"
                >
                  {availableVoices.length === 0 ? (
                    <option>No verified voices available</option>
                  ) : null}
                  {availableVoices.map((v) => (
                    <option key={v.key} value={v.key}>
                      {v.displayName} ({v.gender ? `${v.gender} · ` : ""}
                      {v.locale}){v.style ? ` — ${v.style}` : ""}
                    </option>
                  ))}
                </select>

                <label
                  htmlFor="voice-speech-rate"
                  className="block text-sm font-semibold text-foreground"
                >
                  Speech rate
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id="voice-speech-rate"
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    value={speechRate}
                    onChange={(e) =>
                      setSpeechRate(Number.parseFloat(e.target.value))
                    }
                    disabled={busy}
                    aria-valuetext={`${speechRate.toFixed(1)} times speed`}
                    className="min-h-11 w-full accent-primary"
                  />
                  <output
                    htmlFor="voice-speech-rate"
                    className="min-w-12 text-right text-sm font-semibold tabular-nums text-foreground"
                  >
                    {speechRate.toFixed(1)}×
                  </output>
                </div>
              </div>
            </>
          ) : (
            <>
              <label
                htmlFor="creation-prompt"
                className="block text-sm font-semibold text-foreground"
              >
                Describe your {model?.mediaKind === "VIDEO" ? "video" : "image"}
              </label>
              <div className="relative">
                <textarea
                  id="creation-prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  maxLength={2000}
                  disabled={busy || isEnhancing}
                  placeholder="A cinematic product photograph in warm Omani desert light…"
                  className="min-h-44 w-full rounded-2xl border border-input bg-card p-4 pb-14 text-foreground placeholder:text-muted-foreground"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void enhancePrompt()}
                  disabled={
                    busy ||
                    isEnhancing ||
                    !canGenerate ||
                    !model ||
                    !activeQuote ||
                    !activeQuote.canSpend ||
                    !activeQuote.canAfford ||
                    !prompt.trim()
                  }
                  aria-busy={isEnhancing}
                  className="absolute bottom-3 right-3"
                >
                  {isEnhancing ? (
                    <>
                      <span
                        aria-hidden="true"
                        className="size-3 animate-spin rounded-full border-2 border-primary border-t-transparent"
                      />
                      Enhancing…
                    </>
                  ) : (
                    <>✨ Enhance prompt</>
                  )}
                </Button>
              </div>

              {variant === "advanced" &&
              activeMode === "IMAGE" &&
              model?.capabilities?.referenceImages === true ? (
                <div className="space-y-3 rounded-2xl border border-border bg-card/75 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">
                        Reference images
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Use private images to guide the next creation. Order
                        matters.
                      </p>
                    </div>
                    <label className="cursor-pointer rounded-xl border border-border px-3 py-2 text-xs font-semibold text-primary hover:border-primary/40">
                      {referenceBusy ? "Uploading…" : "Upload image"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="sr-only"
                        disabled={
                          referenceBusy ||
                          busy ||
                          !canGenerate ||
                          referenceAssetIds.length >= 14
                        }
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void uploadReference(file);
                          event.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                  {referenceAssetIds.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {referenceAssetIds.map((id, index) => {
                        const asset = references.find((item) => item.id === id);
                        return (
                          <div
                            key={id}
                            className="flex items-center gap-2 rounded-xl border border-border bg-background p-1.5 pr-2"
                          >
                            <Image
                              src={`/api/assets/${id}`}
                              alt=""
                              width={48}
                              height={48}
                              unoptimized
                              className="size-12 rounded-lg object-cover"
                            />
                            <span className="max-w-24 truncate text-xs text-foreground">
                              {index + 1}. {asset?.name ?? "Reference"}
                            </span>
                            <button
                              type="button"
                              aria-label={`Remove ${asset?.name ?? "reference"}`}
                              className="rounded px-1 text-muted-foreground hover:text-destructive"
                              onClick={() =>
                                setReferenceAssetIds((previous) =>
                                  previous.filter((value) => value !== id),
                                )
                              }
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                  <select
                    aria-label="Choose an existing reference"
                    value=""
                    disabled={busy || referenceAssetIds.length >= 14}
                    onChange={(event) =>
                      setReferenceAssetIds((previous) =>
                        previous.includes(event.target.value)
                          ? previous
                          : [...previous, event.target.value],
                      )
                    }
                    className="min-h-10 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground"
                  >
                    <option value="">
                      Choose from your reference library…
                    </option>
                    {references
                      .filter((asset) => !referenceAssetIds.includes(asset.id))
                      .map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          {asset.name}
                        </option>
                      ))}
                  </select>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <label htmlFor="reference-url" className="sr-only">
                      Approved image link
                    </label>
                    <input
                      id="reference-url"
                      type="url"
                      value={referenceUrl}
                      onChange={(event) => setReferenceUrl(event.target.value)}
                      placeholder="https://approved-host.example/image.jpg"
                      maxLength={2048}
                      className="min-h-11 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-sm text-foreground"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={
                        !referenceUrl.trim() ||
                        referenceBusy ||
                        !canGenerate ||
                        referenceAssetIds.length >= 14
                      }
                      onClick={() => void importReference()}
                    >
                      Import link
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Links are imported into your private reference library. Your
                    administrator controls approved source hosts.
                  </p>
                </div>
              ) : null}

              {variant === "advanced" &&
              activeMode === "VIDEO" &&
              model?.capabilities?.referenceVideo === true ? (
                <div className="space-y-3 rounded-2xl border border-border bg-card/75 p-4">
                  <h3 className="text-sm font-semibold">Reference video</h3>
                  <p className="text-xs text-muted-foreground">
                    Guide a new clip with an eligible MP4 from your library. The
                    displayed credits are the maximum reservation; unused
                    credits return after provider usage is verified.
                  </p>
                  <label className="grid gap-2 text-xs font-semibold">
                    Library clip
                    <select
                      value={referenceVideoAssetId}
                      onChange={(event) => {
                        setReferenceVideoAssetId(event.target.value);
                        if (event.target.value) {
                          setVideoFirstFrameId("");
                          setVideoLastFrameId("");
                        }
                      }}
                      className="min-h-11 rounded-xl border border-input bg-background px-3"
                    >
                      <option value="">No video reference</option>
                      {videoReferences.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}

              {variant === "advanced" &&
              activeMode === "VIDEO" &&
              model?.capabilities?.firstFrame === true &&
              !referenceVideoAssetId ? (
                <div className="space-y-3 rounded-2xl border border-border bg-card/75 p-4">
                  <h3 className="text-sm font-semibold">
                    Guide your opening frame
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Select a private reference image. The output follows its
                    aspect ratio.
                  </p>
                  <label className="grid gap-2 text-xs font-semibold">
                    First frame
                    <select
                      value={videoFirstFrameId}
                      onChange={(event) => {
                        setVideoFirstFrameId(event.target.value);
                        if (!event.target.value) setVideoLastFrameId("");
                      }}
                      className="min-h-11 rounded-xl border border-input bg-background px-3"
                    >
                      <option value="">Text to video</option>
                      {videoFrames.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {videoFirstFrameId &&
                  model?.capabilities?.lastFrame === true ? (
                    <label className="grid gap-2 text-xs font-semibold">
                      Last frame (optional)
                      <select
                        value={videoLastFrameId}
                        onChange={(event) =>
                          setVideoLastFrameId(event.target.value)
                        }
                        className="min-h-11 rounded-xl border border-input bg-background px-3"
                      >
                        <option value="">No fixed ending</option>
                        {videoFrames.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <label className="inline-flex cursor-pointer rounded-xl border border-border px-3 py-2 text-xs font-semibold text-primary">
                    {referenceBusy ? "Uploading…" : "Upload frame image"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      disabled={busy || referenceBusy || !canGenerate}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadReference(file);
                        event.target.value = "";
                      }}
                    />
                  </label>
                </div>
              ) : null}

              <div className={variant === "quick" ? "hidden" : "space-y-4"}>
                {activeMode === "IMAGE" &&
                Number(model?.capabilities?.maxGeneratedImages ?? 1) > 1 ? (
                  <label className="grid gap-2 text-sm font-semibold text-foreground">
                    Images to generate
                    <select
                      value={selectedOutputCount}
                      onChange={(event) =>
                        setOutputCount(Number(event.target.value))
                      }
                      className="min-h-11 rounded-xl border border-input bg-card px-3 text-foreground"
                    >
                      {Array.from(
                        { length: Math.max(1, maxImageOutputs) },
                        (_, index) => index + 1,
                      ).map((count) => (
                        <option key={count} value={count}>
                          {count}
                        </option>
                      ))}
                    </select>
                    <span className="text-xs font-normal text-muted-foreground">
                      Credits are reserved for the maximum and settled on
                      successful outputs.
                    </span>
                  </label>
                ) : null}

                <label
                  htmlFor="media-ratio"
                  className="block text-sm font-semibold text-foreground"
                >
                  Aspect ratio
                </label>
                <select
                  id="media-ratio"
                  value={selectedRatio}
                  onChange={(e) => setRatio(e.target.value)}
                  disabled={busy || availableRatios.length === 0}
                  className="min-h-11 rounded-xl border border-input bg-card px-3 text-foreground"
                >
                  {availableRatios.length ? (
                    (activeMode === "VIDEO" && videoFirstFrameId
                      ? ["adaptive"]
                      : availableRatios
                    ).map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))
                  ) : (
                    <option>No supported aspect ratios advertised</option>
                  )}
                </select>

                <label
                  htmlFor="media-resolution"
                  className="block text-sm font-semibold text-foreground"
                >
                  Resolution
                </label>
                <select
                  id="media-resolution"
                  value={selectedResolution}
                  onChange={(e) => setResolution(e.target.value)}
                  disabled={busy || availableResolutions.length === 0}
                  className="min-h-11 rounded-xl border border-input bg-card px-3 text-foreground"
                >
                  {availableResolutions.length ? (
                    availableResolutions.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))
                  ) : (
                    <option>No supported resolutions advertised</option>
                  )}
                </select>

                {model?.mediaKind === "VIDEO" && (
                  <>
                    <label
                      htmlFor="video-duration"
                      className="block text-sm font-semibold text-foreground"
                    >
                      Duration
                    </label>
                    <select
                      id="video-duration"
                      value={selectedDuration}
                      onChange={(e) => setDuration(e.target.value)}
                      disabled={busy || availableDurations.length === 0}
                      className="min-h-11 rounded-xl border border-input bg-card px-3 text-foreground"
                    >
                      {availableDurations.length ? (
                        availableDurations.map((value) => (
                          <option key={value} value={value}>
                            {value} seconds
                          </option>
                        ))
                      ) : (
                        <option>No supported durations advertised</option>
                      )}
                    </select>

                    {model.capabilities?.generateAudio === true ? (
                      <label className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-sm font-medium text-foreground">
                        <input
                          type="checkbox"
                          checked={generateAudio}
                          onChange={(event) =>
                            setGenerateAudio(event.target.checked)
                          }
                          disabled={busy}
                          className="size-4 accent-primary"
                        />
                        Generate synchronized audio
                      </label>
                    ) : null}
                  </>
                )}
              </div>
            </>
          )}

          {variant === "quick" ? (
            <Link
              href={
                `/app/${organizationSlug}/${activeMode === "VOICE" ? "speech" : activeMode.toLowerCase()}` as Route
              }
              className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-primary hover:underline"
            >
              Open advanced{" "}
              {activeMode === "VOICE" ? "speech" : activeMode.toLowerCase()}{" "}
              studio →
            </Link>
          ) : null}

          <section
            aria-label="Generation cost estimate"
            aria-live="polite"
            className="space-y-3 rounded-xl border border-border bg-surface-sunken p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold">
                {activeQuote?.quote.settlement === "ACTUAL_USAGE"
                  ? "Estimated generation cost"
                  : "Generation quote"}
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">
                Balance: {data?.balance ?? "…"} credits
              </span>
            </div>
            {quotePending ? (
              <p className="text-sm text-muted-foreground">Calculating cost…</p>
            ) : activeQuote ? (
              <>
                <p className="text-lg font-semibold tabular-nums">
                  {activeQuote.quote.estimatedCredits} credits{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    · {activeQuote.quote.estimatedOmr}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {activeQuote.quote.estimatedUsage.isEstimate
                    ? "Estimated "
                    : "Billable "}
                  {activeQuote.quote.estimatedUsage.unit === "COMPLETION_TOKEN"
                    ? "video tokens"
                    : activeQuote.quote.estimatedUsage.unit === "CHARACTER"
                      ? "characters"
                      : "images"}
                  : {activeQuote.quote.estimatedUsage.quantity}
                </p>
                {activeQuote.quote.settlement === "ACTUAL_USAGE" && (
                  <p className="text-xs text-muted-foreground">
                    Wallet hold / maximum charge:{" "}
                    {activeQuote.quote.reservationCredits} credits ·{" "}
                    {activeQuote.quote.maximumChargeOmr}. Final charge uses
                    provider usage; unused held credits return to your balance.
                  </p>
                )}
                {!activeQuote.canSpend && (
                  <p className="text-sm text-destructive">
                    This generation exceeds your monthly spending cap.
                  </p>
                )}
                {!activeQuote.canAfford && (
                  <p className="text-sm text-destructive">
                    Your wallet cannot cover the required wallet hold.
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Choose settings to receive a quote.
              </p>
            )}
            {quoteError && (
              <p role="status" className="text-sm text-destructive">
                {quoteError}
              </p>
            )}
          </section>

          <Button
            type="button"
            className="w-full"
            onClick={() => void generate()}
            aria-busy={busy}
            disabled={
              busy ||
              !canGenerate ||
              !isConfiguredForMode ||
              !model ||
              (activeMode === "VOICE" ? !voiceText.trim() : !prompt.trim()) ||
              (activeMode === "VOICE" &&
                (selectedVoiceKey === "" || activeRequiredCredits === null)) ||
              (activeMode !== "VOICE" &&
                (!selectedRatio || !selectedResolution)) ||
              (model.mediaKind === "VIDEO" &&
                (!selectedDuration || activeRequiredCredits === null)) ||
              (activeRequiredCredits !== null &&
                BigInt(data?.balance ?? "0") < activeRequiredCredits)
            }
          >
            {busy
              ? activeMode === "VOICE"
                ? "Synthesizing voice…"
                : "Queuing media…"
              : `Generate ${
                  activeMode === "VIDEO"
                    ? "video"
                    : activeMode === "VOICE"
                      ? "speech"
                      : "image"
                } · ${activeQuote?.quote.reservationCredits ?? "—"} credits`}
          </Button>
          <p className="text-xs text-muted-foreground">
            Credits are reserved when queued and charged once the media is
            saved.
          </p>
          {!canGenerate ? (
            <p className="text-sm text-muted-foreground">
              Member or Owner access is required to generate.
            </p>
          ) : null}
          {data && !isConfiguredForMode ? (
            <p className="text-sm text-muted-foreground">
              {activeMode === "VOICE"
                ? "Voice generation is not configured yet."
                : "Media generation is not configured yet."}
            </p>
          ) : null}
          {model &&
          activeMode !== "VOICE" &&
          (availableRatios.length === 0 ||
            availableResolutions.length === 0 ||
            (model.mediaKind === "VIDEO" &&
              availableDurations.length === 0)) ? (
            <p className="text-sm text-destructive">
              This model is missing generation capabilities. Ask an admin to
              sync provider models before generating.
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
        </div>
        {variant === "advanced" ? (
          <div>
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display text-lg font-semibold text-foreground">
                Recent creations
              </h3>
              <Link
                href={`/app/${organizationSlug}/history`}
                className="text-sm font-semibold text-primary"
              >
                View full history →
              </Link>
            </div>
            <div className="mt-4 space-y-4" aria-live="polite">
              {data?.jobs.length === 0 ? (
                <p className="rounded-2xl border border-border p-6 text-muted-foreground">
                  Your first generated media will appear here.
                </p>
              ) : null}
              {data?.jobs.map((job) => (
                <article
                  key={job.id}
                  className="rounded-2xl border border-border bg-card p-4"
                >
                  <Link
                    href={`/app/${organizationSlug}/history/${job.id}`}
                    className="mb-2 inline-flex text-xs font-semibold text-primary"
                  >
                    Job details →
                  </Link>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-foreground">
                        {job.providerModel.displayName}
                      </span>
                      {job.project ? (
                        <a
                          href={`/app/${organizationSlug}/projects/${job.project.id}`}
                          className="mt-1 block truncate text-xs font-semibold text-primary"
                        >
                          {job.project.name}
                        </a>
                      ) : null}
                    </span>
                    <StatusDot
                      tone={
                        job.status === "SUCCEEDED"
                          ? "success"
                          : ["FAILED", "MANUAL_REVIEW"].includes(job.status)
                            ? "warning"
                            : "info"
                      }
                    >
                      {statusLabel(job.status, job.providerModel.mediaKind)}
                    </StatusDot>
                  </div>
                  {job.assets.map((asset) => (
                    <div key={asset.id} className="mt-3">
                      {asset.mimeType.startsWith("video/") ? (
                        <video
                          src={`/api/assets/${asset.id}`}
                          controls
                          playsInline
                          preload="metadata"
                          aria-label={`Generated video from ${job.providerModel.displayName}`}
                          className="max-h-96 w-full rounded-xl bg-muted object-contain"
                        />
                      ) : asset.mimeType.startsWith("audio/") ? (
                        <div className="rounded-xl border border-border bg-surface-sunken p-3">
                          <audio
                            src={`/api/assets/${asset.id}`}
                            controls
                            preload="metadata"
                            aria-label={`Generated voice from ${job.providerModel.displayName}`}
                            className="w-full"
                          />
                        </div>
                      ) : (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={`/api/assets/${asset.id}`}
                          alt={`Generated image from ${job.providerModel.displayName}`}
                          className="max-h-96 w-full rounded-xl bg-muted object-contain"
                        />
                      )}
                      <a
                        href={`/api/assets/${asset.id}?download=1`}
                        className="mt-2 inline-flex min-h-10 items-center text-sm font-semibold text-primary"
                      >
                        Download{" "}
                        {asset.mimeType.startsWith("video/")
                          ? "MP4"
                          : asset.mimeType.startsWith("audio/")
                            ? "MP3"
                            : asset.mimeType === "image/jpeg"
                              ? "JPEG"
                              : "PNG"}
                      </a>
                      {asset.mimeType.startsWith("image/") ? (
                        <Link
                          href={
                            `/app/${organizationSlug}/image?assetId=${encodeURIComponent(asset.id)}#image-editor` as Route
                          }
                          className="ml-4 inline-flex min-h-10 items-center text-sm font-semibold text-primary"
                        >
                          Edit image →
                        </Link>
                      ) : null}
                      {asset.mimeType.startsWith("video/") ? (
                        <Link
                          href={
                            `/app/${organizationSlug}/video?assetId=${encodeURIComponent(asset.id)}#video-editor` as Route
                          }
                          className="ml-4 inline-flex min-h-10 items-center text-sm font-semibold text-primary"
                        >
                          Edit video →
                        </Link>
                      ) : null}
                    </div>
                  ))}
                  {job.errorMessage ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {job.errorMessage}
                    </p>
                  ) : null}
                  {job.status === "MANUAL_REVIEW" ? (
                    <p className="mt-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
                      This creation needs an operator to check the provider
                      result. Your credits remain reserved. Keep this job in
                      your history and ask support to review it before starting
                      another attempt.
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs tabular-nums text-muted-foreground">
                    {job.status === "SUCCEEDED"
                      ? `${job.chargedCredits} credits charged`
                      : job.status === "FAILED"
                        ? "No charge"
                        : `${job.reservedCredits} credits reserved`}
                  </p>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
