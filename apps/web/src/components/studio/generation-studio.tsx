"use client";

import { countBillableCharacters } from "@aiwa/credits/pricing";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ProcessFeedback } from "@/components/process/process-feedback";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/creative";
import { Tape } from "@/components/ui/sketch";
import { VoiceCastingBooth } from "@/components/ui/voice-casting-booth";
import {
  StudioModelSelect,
  type StudioModelOption,
} from "@/components/studio/studio-model-select";
import { announceGenerationStarted } from "@/lib/generation-activity";
import { selectQuickCreateModel } from "@/lib/quick-create-model";
import {
  capabilityValues,
  referenceCapabilityLabel,
  resolutionLabel,
  selectSupportedCapability,
  type CapabilityValue,
} from "@/lib/studio-model-capabilities";
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
type VideoWorkflow =
  | "GENERATE"
  | "FRAME_TO_VIDEO"
  | "FIRST_LAST_FRAME"
  | "REFERENCE"
  | "EDIT"
  | "EXTEND"
  | "DRAFT"
  | "DRAFT_FINAL"
  | "TALKING_AVATAR";
type VideoSourceRole =
  | "FIRST_FRAME"
  | "LAST_FRAME"
  | "REFERENCE_IMAGE"
  | "REFERENCE_VIDEO"
  | "REFERENCE_AUDIO"
  | "SOURCE_VIDEO"
  | "AVATAR_IMAGE"
  | "DRIVING_AUDIO";
type VideoSourceInput = {
  assetId: string;
  role: VideoSourceRole;
  position: number;
};
type Job = {
  id: string;
  status: string;
  errorMessage: string | null;
  reservedCredits: string;
  chargedCredits: string;
  providerModel: {
    id: string;
    providerModelId: string;
    displayName: string;
    mediaKind: MediaKind;
  };
  project: ProjectOption | null;
  createdAt?: string;
  videoWorkflow?: VideoWorkflow | null;
  draftExpiresAt?: string | null;
  assets: {
    id: string;
    mimeType: string;
    generationOutputIndex?: number | null;
  }[];
};
type Studio = {
  configured: boolean;
  mediaConfigured?: boolean;
  visionConfigured?: boolean;
  voiceConfigured?: boolean;
  balance: string;
  models: Model[];
  voices?: PresetVoice[];
  projects: ProjectOption[];
  jobs: Job[];
};
function providerDisplayName(provider: string): string {
  const labels: Record<string, string> = {
    BYTEPLUS: "BytePlus",
    NVIDIA: "NVIDIA",
    GROQ: "Groq",
    GEMINI: "Gemini",
    CLOUDFLARE: "Cloudflare",
  };
  return labels[provider] ?? provider;
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
  promptEnhancementModels = [],
  promptEnhancementDefaultModelId = null,
}: {
  canGenerate: boolean;
  organizationId: string;
  organizationSlug: string;
  variant?: "quick" | "advanced";
  initialMode?: MediaKind;
  promptEnhancementModels?: StudioModelOption[];
  promptEnhancementDefaultModelId?: string | null;
}) {
  const router = useRouter();
  const [data, setData] = useState<Studio | null>(null);
  const [activeMode, setActiveMode] = useState<MediaKind>(initialMode);
  const [modelId, setModelId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [voiceText, setVoiceText] = useState("");
  const [voiceKey, setVoiceKey] = useState("jasper");
  const [speechRate, setSpeechRate] = useState(1.0);
  const [isVoiceBoothOpen, setIsVoiceBoothOpen] = useState(false);
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
  const [videoAudioReferences, setVideoAudioReferences] = useState<
    ReferenceAsset[]
  >([]);
  const [referenceAssetIds, setReferenceAssetIds] = useState<string[]>([]);
  const [videoWorkflow, setVideoWorkflow] = useState<VideoWorkflow>("GENERATE");
  const [videoFirstFrameId, setVideoFirstFrameId] = useState("");
  const [videoLastFrameId, setVideoLastFrameId] = useState("");
  const [videoReferenceImageIds, setVideoReferenceImageIds] = useState<
    string[]
  >([]);
  const [videoReferenceVideoIds, setVideoReferenceVideoIds] = useState<
    string[]
  >([]);
  const [videoReferenceAudioIds, setVideoReferenceAudioIds] = useState<
    string[]
  >([]);
  const [videoSourceAssetId, setVideoSourceAssetId] = useState("");
  const [avatarImageId, setAvatarImageId] = useState("");
  const [drivingAudioId, setDrivingAudioId] = useState("");
  const [drivingAudioBusy, setDrivingAudioBusy] = useState(false);
  const [sourceDraftJobId, setSourceDraftJobId] = useState("");
  const [videoOutputFormat, setVideoOutputFormat] = useState<"mp4" | "mov">(
    "mp4",
  );
  const [extensionDirection, setExtensionDirection] = useState<
    "BEFORE" | "AFTER"
  >("AFTER");
  const [returnLastFrame, setReturnLastFrame] = useState(true);
  const [referenceBusy, setReferenceBusy] = useState(false);
  const [referenceUrl, setReferenceUrl] = useState("");
  const [outputCount, setOutputCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [promptEnhancementModelId, setPromptEnhancementModelId] = useState(
    promptEnhancementDefaultModelId ?? promptEnhancementModels[0]?.id ?? "",
  );
  const [enhancementAttribution, setEnhancementAttribution] = useState<{
    name: string;
    provider: string;
  } | null>(null);
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

  const model =
    modelsForMode.find((m) => m.id === modelId) ??
    (variant === "quick"
      ? selectQuickCreateModel(modelsForMode, activeMode)
      : modelsForMode[0]);
  const isTalkingAvatarModel =
    activeMode === "VIDEO" && model?.capabilities?.talkingAvatar === true;
  const validAvatarFrames = useMemo(
    () =>
      videoFrames.filter(
        (asset) =>
          ["image/jpeg", "image/png", "image/jfif", "image/pjpeg"].includes(
            asset.mimeType ?? "",
          ) &&
          Number(asset.byteSize ?? 0) > 0 &&
          Number(asset.byteSize ?? 0) < 5_000_000 &&
          asset.width !== null &&
          asset.height !== null &&
          asset.width > 0 &&
          asset.height > 0 &&
          asset.width < 4096 &&
          asset.height < 4096,
      ),
    [videoFrames],
  );
  const validDrivingAudio = useMemo(
    () =>
      videoAudioReferences.filter(
        (asset) =>
          (asset.mimeType ?? "").startsWith("audio/") &&
          Number(asset.byteSize ?? 0) > 0 &&
          Number(asset.byteSize ?? 0) <= 25 * 1024 * 1024 &&
          asset.durationMs !== null &&
          asset.durationMs !== undefined &&
          asset.durationMs > 0 &&
          asset.durationMs < 60_000,
      ),
    [videoAudioReferences],
  );
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
  const availableDurations = useMemo(() => {
    const explicit = capabilityValues(model?.capabilities, "durationSeconds");
    if (explicit.length > 0) return explicit;
    if (model?.mediaKind !== "VIDEO") return [];
    const minimum = Number(model.capabilities?.minimumDurationSeconds ?? 4);
    const maximum = Number(model.capabilities?.maximumDurationSeconds ?? 15);
    if (
      !Number.isSafeInteger(minimum) ||
      !Number.isSafeInteger(maximum) ||
      minimum < 1 ||
      maximum < minimum ||
      maximum > 30
    )
      return [];
    return Array.from({ length: maximum - minimum + 1 }, (_, index) =>
      String(minimum + index),
    );
  }, [model?.capabilities, model?.mediaKind]);

  const videoForcesAdaptive =
    activeMode === "VIDEO" &&
    [
      "FRAME_TO_VIDEO",
      "FIRST_LAST_FRAME",
      "EDIT",
      "EXTEND",
      "TALKING_AVATAR",
    ].includes(videoWorkflow);
  const selectedRatio = videoForcesAdaptive
    ? "adaptive"
    : selectSupportedCapability(model?.capabilities, "aspectRatio", ratio, [
        "1:1",
      ]);
  const selectedResolution =
    activeMode === "VIDEO" && videoWorkflow === "DRAFT"
      ? "480p"
      : activeMode === "VIDEO" && videoWorkflow === "DRAFT_FINAL"
        ? "1080p"
        : selectSupportedCapability(
            model?.capabilities,
            "resolution",
            resolution,
            [activeMode === "VIDEO" ? "720p" : "2K"],
          );
  const selectedDuration =
    activeMode === "VIDEO" &&
    (videoWorkflow === "EDIT" || videoWorkflow === "TALKING_AVATAR")
      ? "-1"
      : availableDurations.includes(duration)
        ? duration
        : (availableDurations[0] ?? "5");

  const videoSources = useMemo<VideoSourceInput[]>(() => {
    const sources: Omit<VideoSourceInput, "position">[] = [];
    if (videoWorkflow === "FRAME_TO_VIDEO" && videoFirstFrameId)
      sources.push({ assetId: videoFirstFrameId, role: "FIRST_FRAME" });
    if (videoWorkflow === "FIRST_LAST_FRAME") {
      if (videoFirstFrameId)
        sources.push({ assetId: videoFirstFrameId, role: "FIRST_FRAME" });
      if (videoLastFrameId)
        sources.push({ assetId: videoLastFrameId, role: "LAST_FRAME" });
    }
    if (videoWorkflow === "REFERENCE" || videoWorkflow === "DRAFT") {
      for (const assetId of videoReferenceImageIds)
        sources.push({ assetId, role: "REFERENCE_IMAGE" });
      for (const assetId of videoReferenceVideoIds)
        sources.push({ assetId, role: "REFERENCE_VIDEO" });
      for (const assetId of videoReferenceAudioIds)
        sources.push({ assetId, role: "REFERENCE_AUDIO" });
    }
    if (
      (videoWorkflow === "EDIT" || videoWorkflow === "EXTEND") &&
      videoSourceAssetId
    )
      sources.push({ assetId: videoSourceAssetId, role: "SOURCE_VIDEO" });
    if (videoWorkflow === "TALKING_AVATAR") {
      if (avatarImageId)
        sources.push({ assetId: avatarImageId, role: "AVATAR_IMAGE" });
      if (drivingAudioId)
        sources.push({ assetId: drivingAudioId, role: "DRIVING_AUDIO" });
    }
    return sources.map((source, position) => ({ ...source, position }));
  }, [
    videoFirstFrameId,
    videoLastFrameId,
    videoReferenceAudioIds,
    videoReferenceImageIds,
    videoReferenceVideoIds,
    videoSourceAssetId,
    avatarImageId,
    drivingAudioId,
    videoWorkflow,
  ]);

  const maxVideoReferenceImages = Number(
    model?.capabilities?.maxReferenceImages ?? 0,
  );
  const maxVideoReferenceVideos = Number(
    model?.capabilities?.maxReferenceVideos ?? 0,
  );
  const maxVideoReferenceAudio = Number(
    model?.capabilities?.maxReferenceAudio ?? 0,
  );
  const availableVideoWorkflows = useMemo<
    Array<{ value: VideoWorkflow; label: string; hint: string }>
  >(() => {
    if (model?.capabilities?.talkingAvatar === true) {
      return [
        {
          value: "TALKING_AVATAR",
          label: "Talking avatar",
          hint: "Portrait + driving audio",
        },
      ];
    }
    return [
      { value: "GENERATE", label: "Generate", hint: "Text → video" },
      ...(model?.capabilities?.firstFrame === true
        ? [
            {
              value: "FRAME_TO_VIDEO" as const,
              label: "Frames",
              hint: "Animate a start / end",
            },
          ]
        : []),
      ...(model?.capabilities?.referenceImages === true ||
      model?.capabilities?.referenceVideo === true ||
      model?.capabilities?.referenceAudio === true
        ? [
            {
              value: "REFERENCE" as const,
              label: "References",
              hint: "Match multimodal guides",
            },
          ]
        : []),
      ...(model?.capabilities?.editVideo === true
        ? [
            {
              value: "EDIT" as const,
              label: "AI Edit",
              hint: "Transform a source clip",
            },
          ]
        : []),
      ...(model?.capabilities?.extendVideo === true
        ? [
            {
              value: "EXTEND" as const,
              label: "Extend",
              hint: "Continue before / after",
            },
          ]
        : []),
      ...(model?.capabilities?.draftMode === true
        ? [
            {
              value: "DRAFT" as const,
              label: "Draft",
              hint: "480p review → final",
            },
          ]
        : []),
    ];
  }, [model?.capabilities]);
  const videoRequestReady =
    activeMode !== "VIDEO"
      ? true
      : videoWorkflow === "GENERATE"
        ? true
        : videoWorkflow === "FRAME_TO_VIDEO"
          ? Boolean(videoFirstFrameId)
          : videoWorkflow === "FIRST_LAST_FRAME"
            ? Boolean(videoFirstFrameId && videoLastFrameId)
            : videoWorkflow === "REFERENCE"
              ? videoSources.length > 0 &&
                (model?.capabilities?.audioOnlyReference === true ||
                  videoReferenceAudioIds.length === 0 ||
                  videoReferenceImageIds.length > 0 ||
                  videoReferenceVideoIds.length > 0)
              : videoWorkflow === "EDIT" || videoWorkflow === "EXTEND"
                ? Boolean(videoSourceAssetId)
                : videoWorkflow === "TALKING_AVATAR"
                  ? Boolean(avatarImageId && drivingAudioId)
                  : videoWorkflow === "DRAFT_FINAL"
                    ? Boolean(sourceDraftJobId)
                    : true;

  const handleModeChange = useCallback(
    (mode: MediaKind) => {
      if (mode !== activeMode) {
        setTemplateContext(null);
        setReferenceAssetIds([]);
        setOutputCount(1);
      }
      setActiveMode(mode);
      setError(null);
      const nextModels =
        data?.models.filter((candidate) => candidate.mediaKind === mode) ?? [];
      const nextModel =
        variant === "quick"
          ? selectQuickCreateModel(nextModels, mode)
          : nextModels[0];
      if (nextModel) {
        setModelId(nextModel.id);
      }
    },
    [activeMode, data?.models, variant],
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
          schemaVersion: 2,
          workflow: videoWorkflow,
          sources: videoSources,
          durationSeconds: Number(selectedDuration),
          generateAudio:
            videoWorkflow === "TALKING_AVATAR" ? false : generateAudio,
          outputFormat:
            videoWorkflow === "TALKING_AVATAR" ? "mp4" : videoOutputFormat,
          returnLastFrame:
            videoWorkflow === "TALKING_AVATAR" ? false : returnLastFrame,
          ...(videoWorkflow === "DRAFT_FINAL" && sourceDraftJobId
            ? { sourceDraftJobId }
            : {}),
          ...(videoWorkflow === "EXTEND" ? { extensionDirection } : {}),
        }
      : {}),
  });
  const activeQuote =
    quoteState?.key === quoteRequestKey &&
    quoteState.quote.priceVersionId === activePriceVersionId
      ? quoteState
      : null;
  useEffect(() => {
    if (
      !activeModelId ||
      (activeMode === "VOICE" && !billableCharacters) ||
      (activeMode === "VIDEO" && !videoRequestReady)
    ) {
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
    videoRequestReady,
  ]);
  const activeRequiredCredits = activeQuote
    ? BigInt(activeQuote.quote.reservationCredits)
    : null;

  const isConfiguredForMode =
    activeMode === "VOICE"
      ? Boolean(data?.voiceConfigured)
      : model?.providerModelId === "omnihuman-1.5"
        ? Boolean(data?.visionConfigured)
        : Boolean(data?.mediaConfigured ?? data?.configured);

  useEffect(() => {
    if (activeMode !== "VIDEO") return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (isTalkingAvatarModel) {
        if (videoWorkflow !== "TALKING_AVATAR")
          setVideoWorkflow("TALKING_AVATAR");
        if (ratio !== "adaptive") setRatio("adaptive");
        if (generateAudio) setGenerateAudio(false);
        if (videoOutputFormat !== "mp4") setVideoOutputFormat("mp4");
        if (returnLastFrame) setReturnLastFrame(false);
      } else if (videoWorkflow === "TALKING_AVATAR") {
        setVideoWorkflow("GENERATE");
        setAvatarImageId("");
        setDrivingAudioId("");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    activeMode,
    generateAudio,
    isTalkingAvatarModel,
    ratio,
    returnLastFrame,
    videoOutputFormat,
    videoWorkflow,
  ]);

  useEffect(() => {
    const onWorkflow = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          workflow?: "EDIT" | "EXTEND";
          assetId?: string;
        }>
      ).detail;
      if (
        !detail ||
        (detail.workflow !== "EDIT" && detail.workflow !== "EXTEND") ||
        typeof detail.assetId !== "string" ||
        !detail.assetId
      )
        return;
      const preferred =
        data?.models.find(
          (candidate) =>
            candidate.mediaKind === "VIDEO" &&
            (detail.workflow === "EDIT"
              ? candidate.capabilities?.editVideo === true
              : candidate.capabilities?.extendVideo === true),
        ) ?? data?.models.find((candidate) => candidate.mediaKind === "VIDEO");
      if (!preferred) {
        setError("No enabled video model with active pricing is available.");
        return;
      }
      setActiveMode("VIDEO");
      setModelId(preferred.id);
      setVideoWorkflow(detail.workflow);
      setVideoSourceAssetId(detail.assetId);
      setSourceDraftJobId("");
      setRatio("adaptive");
      requestAnimationFrame(() =>
        document
          .getElementById("create")
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    };
    window.addEventListener("creators:video-workflow", onWorkflow);
    return () =>
      window.removeEventListener("creators:video-workflow", onWorkflow);
  }, [data?.models]);

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
              ["video/mp4", "video/quicktime"].includes(asset.mimeType ?? "") &&
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
  useEffect(() => {
    if (
      variant !== "advanced" ||
      activeMode !== "VIDEO" ||
      (model?.capabilities?.referenceAudio !== true &&
        model?.capabilities?.audioInput !== true)
    )
      return;
    const controller = new AbortController();
    void fetch(
      `/api/assets?organizationId=${encodeURIComponent(organizationId)}&mediaKind=AUDIO&limit=100`,
      { signal: controller.signal, cache: "no-store" },
    )
      .then((response) =>
        response.ok
          ? (response.json() as Promise<{ assets: ReferenceAsset[] }>)
          : { assets: [] },
      )
      .then((body) =>
        setVideoAudioReferences(
          body.assets.filter((asset) => {
            if (model.capabilities?.audioInput === true) {
              return (
                asset.durationMs !== null &&
                asset.durationMs !== undefined &&
                asset.durationMs > 0 &&
                asset.durationMs < 60_000 &&
                Number(asset.byteSize) <= 25 * 1024 * 1024
              );
            }
            return (
              asset.durationMs !== null &&
              asset.durationMs !== undefined &&
              asset.durationMs >= 2_000 &&
              asset.durationMs <=
                Number(
                  model.capabilities?.maxReferenceAudioDurationSeconds ?? 30,
                ) *
                  1000 &&
              Number(asset.byteSize) <= 15 * 1024 * 1024
            );
          }),
        ),
      )
      .catch(() => {
        if (!controller.signal.aborted) setVideoAudioReferences([]);
      });
    return () => controller.abort();
  }, [
    activeMode,
    organizationId,
    variant,
    model?.capabilities?.referenceAudio,
    model?.capabilities?.audioInput,
    model?.capabilities?.maxReferenceAudioDurationSeconds,
  ]);

  async function uploadReference(file: File) {
    if (referenceBusy || !canGenerate) return;
    if (
      videoWorkflow === "TALKING_AVATAR" &&
      (!["image/jpeg", "image/png"].includes(file.type) ||
        file.size <= 0 ||
        file.size >= 5_000_000)
    ) {
      setError("Avatar portrait must be a JPEG/PNG file under 5 MB.");
      return;
    }
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
        if (videoWorkflow === "TALKING_AVATAR") {
          setAvatarImageId(body.asset.id);
        } else if (videoWorkflow === "REFERENCE" || videoWorkflow === "DRAFT") {
          setVideoReferenceImageIds((previous) =>
            previous.includes(body.asset!.id)
              ? previous
              : [...previous, body.asset!.id].slice(
                  0,
                  Math.max(1, maxVideoReferenceImages),
                ),
          );
        } else {
          setVideoFirstFrameId(body.asset.id);
          setVideoWorkflow("FRAME_TO_VIDEO");
        }
      } else {
        setReferenceAssetIds((previous) => [...previous, body.asset!.id]);
      }
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Reference upload failed.",
      );
    } finally {
      setReferenceBusy(false);
    }
  }

  async function uploadDrivingAudio(file: File) {
    if (drivingAudioBusy || !canGenerate) return;
    if (
      !["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav"].includes(
        file.type,
      ) ||
      file.size <= 0 ||
      file.size > 25 * 1024 * 1024
    ) {
      setError("Driving audio must be an MP3/WAV file within 25 MB.");
      return;
    }
    setDrivingAudioBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/assets/media-upload", {
        method: "POST",
        headers: {
          "x-organization-id": organizationId,
          "x-file-name": file.name,
          "content-type": file.type || "application/octet-stream",
        },
        body: file,
      });
      const body = (await response.json()) as {
        asset?: ReferenceAsset;
        error?: string;
      };
      if (!response.ok || !body.asset)
        throw new Error(body.error ?? "Driving audio upload failed.");
      if (
        body.asset.durationMs === null ||
        body.asset.durationMs === undefined ||
        body.asset.durationMs <= 0 ||
        body.asset.durationMs >= 60_000
      ) {
        throw new Error("Driving audio must be shorter than 60 seconds.");
      }
      setVideoAudioReferences((previous) => [body.asset!, ...previous]);
      setDrivingAudioId(body.asset.id);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Driving audio upload failed.",
      );
    } finally {
      setDrivingAudioBusy(false);
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
          schemaVersion: 2,
          workflow: videoWorkflow,
          sources: videoSources,
          durationSeconds: Number.parseInt(selectedDuration, 10),
          generateAudio:
            videoWorkflow === "TALKING_AVATAR" ? false : generateAudio,
          outputFormat:
            videoWorkflow === "TALKING_AVATAR" ? "mp4" : videoOutputFormat,
          returnLastFrame:
            videoWorkflow === "TALKING_AVATAR" ? false : returnLastFrame,
          ...(videoWorkflow === "DRAFT_FINAL" && sourceDraftJobId
            ? { sourceDraftJobId }
            : {}),
          ...(videoWorkflow === "EXTEND" ? { extensionDirection } : {}),
        }),
      };
    }
    const fingerprint = JSON.stringify(input);
    if (attempt.current?.fingerprint !== fingerprint)
      attempt.current = { fingerprint, key: crypto.randomUUID() };

    if (variant === "quick") {
      try {
        const conversationRes = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            projectId: selectedProjectId || undefined,
            prompt: model.mediaKind === "VOICE" ? voiceText.trim() : prompt,
            modality: model.mediaKind,
            modelId: model.id,
            priceVersionId: model.priceVersionId,
            quoteToken: activeQuote.quote.quoteToken,
            idempotencyKey: attempt.current.key,
            aspectRatio: selectedRatio,
            resolution: selectedResolution,
            outputCount: model.mediaKind === "IMAGE" ? selectedOutputCount : 1,
            durationSeconds:
              model.mediaKind === "VIDEO"
                ? Number.parseInt(selectedDuration, 10)
                : undefined,
            voiceKey:
              model.mediaKind === "VOICE" ? selectedVoiceKey : undefined,
            speechRate: model.mediaKind === "VOICE" ? speechRate : undefined,
          }),
        });

        const body = (await conversationRes.json()) as {
          conversationId?: string;
          jobId?: string;
          title?: string;
          error?: string;
        };

        if (!conversationRes.ok) {
          throw new Error(
            body.error ?? "Creative conversation could not be initiated.",
          );
        }

        if (body.jobId) {
          announceGenerationStarted(organizationId, body.jobId);
        }

        if (body.conversationId) {
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("aiwa:conversation-started", {
                detail: {
                  id: body.conversationId,
                  title: body.title || "New creation",
                  threadType: "CREATIVE",
                  updatedAt: new Date().toISOString(),
                },
              }),
            );
          }

          router.push(
            `/app/${encodeURIComponent(organizationSlug)}/conversations/${body.conversationId}` as Route,
          );
        }

        attempt.current = null;
        return;
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Connection interrupted. Retry to check the same request.",
        );
        return;
      } finally {
        setBusy(false);
      }
    }

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
      const body = (await response.json()) as {
        jobId?: string;
        error?: string;
      };
      if (!response.ok)
        throw new Error(body.error ?? "Generation could not be queued.");
      if (!body.jobId)
        throw new Error("Generation was accepted without a durable job id.");
      announceGenerationStarted(organizationId, body.jobId);
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
    if (
      !sourcePrompt ||
      !model ||
      !promptEnhancementModelId ||
      isEnhancing ||
      busy ||
      !canGenerate
    )
      return;

    const fingerprint = JSON.stringify({
      organizationId,
      sourcePrompt,
      targetMedia: model.mediaKind,
      promptEnhancementModelId,
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
          modelId: promptEnhancementModelId,
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
          if (
            !job.model ||
            typeof job.model.name !== "string" ||
            typeof job.model.provider !== "string"
          )
            throw new Error("Prompt enhancement provenance is unavailable.");
          setPrompt(enhancedPrompt);
          setEnhancementAttribution({
            name: job.model.name,
            provider: job.model.provider,
          });
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
      className="paper-sheet relative w-full min-w-0 rounded-[28px] border border-border p-5 sm:p-7"
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
        className="mt-6"
      >
        <div className="space-y-4">
          <div className={variant === "quick" ? "hidden" : "space-y-4"}>
            <div className="flex items-center justify-between gap-3">
              <label
                className="block text-sm font-semibold text-foreground"
                htmlFor="media-model"
              >
                Generation model
              </label>
              {model ? (
                <span className="text-xs text-muted-foreground">
                  {model.name}
                </span>
              ) : null}
            </div>
            <select
              id="media-model"
              value={model?.id ?? ""}
              onChange={(e) => {
                const nextId = e.target.value;
                setModelId(nextId);
                const nextModel = modelsForMode.find((m) => m.id === nextId);
                if (nextModel?.capabilities) {
                  if (nextModel.capabilities.talkingAvatar === true) {
                    setVideoWorkflow("TALKING_AVATAR");
                    setRatio("adaptive");
                    setGenerateAudio(false);
                    setVideoOutputFormat("mp4");
                    setReturnLastFrame(false);
                  } else if (videoWorkflow === "TALKING_AVATAR") {
                    setVideoWorkflow("GENERATE");
                    setAvatarImageId("");
                    setDrivingAudioId("");
                  }
                  const nextResolution = selectSupportedCapability(
                    nextModel.capabilities,
                    "resolution",
                    resolution,
                    ["2K"],
                  );
                  if (nextResolution && nextResolution !== resolution) {
                    setResolution(nextResolution);
                  }
                  const nextRatio = selectSupportedCapability(
                    nextModel.capabilities,
                    "aspectRatio",
                    ratio,
                    ["1:1"],
                  );
                  if (nextRatio && nextRatio !== ratio) {
                    setRatio(nextRatio);
                  }
                }
              }}
              disabled={busy || isEnhancing}
              className="min-h-11 w-full rounded-xl border border-input bg-card px-3 text-foreground"
            >
              {!modelsForMode.length ? (
                <option>
                  No enabled {activeMode.toLowerCase()} models with active
                  pricing
                </option>
              ) : null}
              {modelsForMode.map((m) => {
                const resolutions = capabilityValues(
                  m.capabilities,
                  "resolution",
                );
                const resSnippet = resolutions.length
                  ? ` · [${resolutions.join(", ")}]`
                  : "";
                return (
                  <option key={m.id} value={m.id}>
                    {m.name} ·{" "}
                    {m.pricingDimension === "TOKEN"
                      ? "Usage-based pricing"
                      : m.pricingDimension === "CHARACTER"
                        ? `${m.credits} credits / ${m.unitQuantity ?? 1000} chars`
                        : m.pricingDimension === "SECOND"
                          ? `${m.credits} credits / ${m.unitQuantity ?? 5}s`
                          : `${m.credits} credits`}
                    {resSnippet}
                  </option>
                );
              })}
            </select>
            {model?.description ? (
              <p className="text-xs text-muted-foreground">
                {model.description}
              </p>
            ) : null}

            {model?.capabilities ? (
              <div
                className="flex flex-wrap items-center gap-1.5 pt-1"
                aria-label="Supported model parameters"
              >
                {availableResolutions.length > 0 && (
                  <span className="inline-flex items-center rounded-md border border-border/80 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-foreground">
                    Resolutions: {availableResolutions.join(", ")}
                  </span>
                )}
                {availableRatios.length > 0 && (
                  <span className="inline-flex items-center rounded-md border border-border/80 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {availableRatios.length} aspect ratios
                  </span>
                )}
                {referenceCapabilityLabel(model.capabilities) ? (
                  <span className="inline-flex items-center rounded-md border border-border/80 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {referenceCapabilityLabel(model.capabilities)}
                  </span>
                ) : null}
                {Number(model.capabilities.maxGeneratedImages ?? 1) > 1 && (
                  <span className="inline-flex items-center rounded-md border border-border/80 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    Up to {Number(model.capabilities.maxGeneratedImages)}{" "}
                    outputs
                  </span>
                )}
              </div>
            ) : null}

            {model?.providerModelId.includes("seedream-5-0-pro") ? (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
                <span className="font-semibold text-primary">
                  Coordinate-guided precision editing
                </span>
                <a
                  href="#image-editor"
                  className="font-semibold text-primary underline-offset-2 hover:underline"
                >
                  Open Precision Image Desk →
                </a>
              </div>
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
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="voice-preset"
                    className="block text-sm font-semibold text-foreground"
                  >
                    Preset voice
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsVoiceBoothOpen(true)}
                    className="text-xs font-semibold text-primary hover:text-primary/80"
                  >
                    Audition in Booth →
                  </Button>
                </div>
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
                {videoWorkflow === "TALKING_AVATAR"
                  ? "Optional motion direction"
                  : `Describe your ${model?.mediaKind === "VIDEO" ? "video" : "image"}`}
              </label>
              {variant === "advanced" && (
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <StudioModelSelect
                    models={promptEnhancementModels}
                    value={promptEnhancementModelId}
                    onChange={(value) => {
                      setPromptEnhancementModelId(value);
                      setEnhancementAttribution(null);
                      enhancementAttempt.current = null;
                    }}
                    disabled={busy || isEnhancing}
                    ariaLabel="Prompt enhancement model"
                    className="max-w-full"
                  />
                  <span className="text-[11px] text-muted-foreground">
                    Prompt Enhance is assistive and does not charge workspace
                    credits.
                  </span>
                </div>
              )}
              <div className="relative">
                <textarea
                  id="creation-prompt"
                  value={prompt}
                  onChange={(e) => {
                    setPrompt(e.target.value);
                    setEnhancementAttribution(null);
                  }}
                  maxLength={2000}
                  disabled={busy || isEnhancing}
                  placeholder={
                    videoWorkflow === "TALKING_AVATAR"
                      ? "Optional: subtle smile, natural gestures, steady eye contact…"
                      : "A cinematic product photograph in warm Omani desert light…"
                  }
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
                    !promptEnhancementModelId ||
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
              {variant === "advanced" && enhancementAttribution && (
                <p
                  role="status"
                  className="mt-2 text-xs font-medium text-muted-foreground"
                >
                  Enhanced with {enhancementAttribution.name} ·{" "}
                  {providerDisplayName(enhancementAttribution.provider)}
                </p>
              )}
              {variant === "advanced" &&
              !enhancementAttribution &&
              promptEnhancementModels.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Prompt Enhance is unavailable until an eligible model is
                  enabled, priced, and configured.
                </p>
              ) : null}

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

              {variant === "advanced" && activeMode === "VIDEO" ? (
                <div className="space-y-4 rounded-2xl border border-border bg-card/75 p-4">
                  <div>
                    <h3 className="text-sm font-semibold">Creation workflow</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Choose the creative intent first. Creators only exposes
                      settings and source roles supported by the selected model.
                    </p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {availableVideoWorkflows.map((item) => {
                      const selected =
                        videoWorkflow === item.value ||
                        (item.value === "FRAME_TO_VIDEO" &&
                          videoWorkflow === "FIRST_LAST_FRAME");
                      return (
                        <button
                          key={item.value}
                          type="button"
                          aria-pressed={selected}
                          disabled={busy}
                          onClick={() => {
                            setVideoWorkflow(item.value);
                            setSourceDraftJobId("");
                            if (item.value === "FRAME_TO_VIDEO") {
                              setVideoLastFrameId("");
                            }
                            if (item.value !== "DRAFT") {
                              setVideoOutputFormat("mp4");
                            }
                          }}
                          className={`rounded-xl border px-3 py-3 text-left transition ${
                            selected
                              ? "border-primary bg-primary/[0.08]"
                              : "border-border bg-background hover:border-primary/40"
                          }`}
                        >
                          <span className="block text-xs font-semibold text-foreground">
                            {item.label}
                          </span>
                          <span className="mt-1 block text-[11px] text-muted-foreground">
                            {item.hint}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {(videoWorkflow === "FRAME_TO_VIDEO" ||
                    videoWorkflow === "FIRST_LAST_FRAME") && (
                    <div className="grid gap-3 rounded-xl border border-border bg-surface-sunken p-3 sm:grid-cols-2">
                      <label className="grid gap-2 text-xs font-semibold">
                        First frame
                        <select
                          value={videoFirstFrameId}
                          onChange={(event) => {
                            setVideoFirstFrameId(event.target.value);
                            if (!event.target.value) {
                              setVideoLastFrameId("");
                              setVideoWorkflow("FRAME_TO_VIDEO");
                            }
                          }}
                          className="min-h-11 rounded-xl border border-input bg-background px-3"
                        >
                          <option value="">Choose an image…</option>
                          {videoFrames.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      {model?.capabilities?.lastFrame === true ? (
                        <label className="grid gap-2 text-xs font-semibold">
                          Last frame
                          <select
                            value={videoLastFrameId}
                            disabled={!videoFirstFrameId}
                            onChange={(event) => {
                              setVideoLastFrameId(event.target.value);
                              setVideoWorkflow(
                                event.target.value
                                  ? "FIRST_LAST_FRAME"
                                  : "FRAME_TO_VIDEO",
                              );
                            }}
                            className="min-h-11 rounded-xl border border-input bg-background px-3"
                          >
                            <option value="">No fixed ending</option>
                            {videoFrames
                              .filter((item) => item.id !== videoFirstFrameId)
                              .map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.name}
                                </option>
                              ))}
                          </select>
                        </label>
                      ) : null}
                      <label className="inline-flex cursor-pointer self-end rounded-xl border border-border px-3 py-3 text-xs font-semibold text-primary">
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
                  )}

                  {(videoWorkflow === "REFERENCE" ||
                    videoWorkflow === "DRAFT") && (
                    <div className="space-y-3 rounded-xl border border-border bg-surface-sunken p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold">
                            Reference board
                          </p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Multi-select assets. Their visible order becomes the
                            provider Image / Video / Audio reference order.
                          </p>
                        </div>
                        <span className="text-[11px] tabular-nums text-muted-foreground">
                          {videoSources.length} source
                          {videoSources.length === 1 ? "" : "s"}
                        </span>
                      </div>

                      {model?.capabilities?.referenceImages === true ? (
                        <label className="grid gap-2 text-xs font-semibold">
                          Images · up to {maxVideoReferenceImages}
                          <select
                            multiple
                            size={Math.min(5, Math.max(3, videoFrames.length))}
                            value={videoReferenceImageIds}
                            onChange={(event) =>
                              setVideoReferenceImageIds(
                                Array.from(event.currentTarget.selectedOptions)
                                  .map((option) => option.value)
                                  .slice(0, maxVideoReferenceImages),
                              )
                            }
                            className="min-h-24 rounded-xl border border-input bg-background px-3 py-2"
                          >
                            {videoFrames.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}

                      {model?.capabilities?.referenceVideo === true ? (
                        <label className="grid gap-2 text-xs font-semibold">
                          Videos · up to {maxVideoReferenceVideos}
                          <select
                            multiple
                            size={Math.min(
                              5,
                              Math.max(3, videoReferences.length),
                            )}
                            value={videoReferenceVideoIds}
                            onChange={(event) =>
                              setVideoReferenceVideoIds(
                                Array.from(event.currentTarget.selectedOptions)
                                  .map((option) => option.value)
                                  .slice(0, maxVideoReferenceVideos),
                              )
                            }
                            className="min-h-24 rounded-xl border border-input bg-background px-3 py-2"
                          >
                            {videoReferences.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                                {item.durationMs
                                  ? ` · ${(item.durationMs / 1000).toFixed(1)}s`
                                  : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}

                      {model?.capabilities?.referenceAudio === true ? (
                        <label className="grid gap-2 text-xs font-semibold">
                          Audio · up to {maxVideoReferenceAudio}
                          <select
                            multiple
                            size={Math.min(
                              5,
                              Math.max(3, videoAudioReferences.length),
                            )}
                            value={videoReferenceAudioIds}
                            onChange={(event) =>
                              setVideoReferenceAudioIds(
                                Array.from(event.currentTarget.selectedOptions)
                                  .map((option) => option.value)
                                  .slice(0, maxVideoReferenceAudio),
                              )
                            }
                            className="min-h-24 rounded-xl border border-input bg-background px-3 py-2"
                          >
                            {videoAudioReferences.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                                {item.durationMs
                                  ? ` · ${(item.durationMs / 1000).toFixed(1)}s`
                                  : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}

                      {model?.capabilities?.audioOnlyReference !== true &&
                      videoReferenceAudioIds.length > 0 &&
                      videoReferenceImageIds.length === 0 &&
                      videoReferenceVideoIds.length === 0 ? (
                        <p className="text-xs text-destructive">
                          This model requires an image or video alongside audio
                          references.
                        </p>
                      ) : null}
                    </div>
                  )}

                  {videoWorkflow === "TALKING_AVATAR" ? (
                    <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/[0.05] p-3">
                      <div>
                        <p className="text-xs font-semibold text-foreground">
                          Talking-avatar sources
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Choose one portrait and one speech track. Duration and
                          billing are derived from the stored audio metadata.
                        </p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-2 text-xs font-semibold">
                          Avatar portrait
                          <select
                            value={avatarImageId}
                            onChange={(event) =>
                              setAvatarImageId(event.target.value)
                            }
                            className="min-h-11 rounded-xl border border-input bg-background px-3"
                          >
                            <option value="">Choose a portrait…</option>
                            {validAvatarFrames.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="grid gap-2 text-xs font-semibold">
                          Driving speech audio
                          <select
                            value={drivingAudioId}
                            onChange={(event) =>
                              setDrivingAudioId(event.target.value)
                            }
                            className="min-h-11 rounded-xl border border-input bg-background px-3"
                          >
                            <option value="">Choose an audio track…</option>
                            {validDrivingAudio.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                                {item.durationMs
                                  ? ` · ${(item.durationMs / 1000).toFixed(1)}s`
                                  : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <label className="inline-flex cursor-pointer rounded-xl border border-border px-3 py-2 text-xs font-semibold text-primary">
                          {referenceBusy ? "Uploading…" : "Upload portrait"}
                          <input
                            type="file"
                            accept="image/png,image/jpeg"
                            className="sr-only"
                            disabled={busy || referenceBusy || !canGenerate}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) void uploadReference(file);
                              event.target.value = "";
                            }}
                          />
                        </label>
                        <label className="inline-flex cursor-pointer rounded-xl border border-border px-3 py-2 text-xs font-semibold text-primary">
                          {drivingAudioBusy ? "Uploading…" : "Upload MP3 / WAV"}
                          <input
                            type="file"
                            accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav"
                            className="sr-only"
                            disabled={busy || drivingAudioBusy || !canGenerate}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) void uploadDrivingAudio(file);
                              event.target.value = "";
                            }}
                          />
                        </label>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Portrait: JPEG/PNG under 5 MB and below 4096×4096.
                        Driving audio: under 60 seconds.
                      </p>
                    </div>
                  ) : null}

                  {(videoWorkflow === "EDIT" || videoWorkflow === "EXTEND") && (
                    <div className="grid gap-3 rounded-xl border border-border bg-surface-sunken p-3 sm:grid-cols-2">
                      <label className="grid gap-2 text-xs font-semibold">
                        Source video
                        <select
                          value={videoSourceAssetId}
                          onChange={(event) =>
                            setVideoSourceAssetId(event.target.value)
                          }
                          className="min-h-11 rounded-xl border border-input bg-background px-3"
                        >
                          <option value="">Choose a library video…</option>
                          {videoReferences.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                              {item.durationMs
                                ? ` · ${(item.durationMs / 1000).toFixed(1)}s`
                                : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      {videoWorkflow === "EXTEND" ? (
                        <label className="grid gap-2 text-xs font-semibold">
                          Extend
                          <select
                            value={extensionDirection}
                            onChange={(event) =>
                              setExtensionDirection(
                                event.target.value as "BEFORE" | "AFTER",
                              )
                            }
                            className="min-h-11 rounded-xl border border-input bg-background px-3"
                          >
                            <option value="AFTER">After the source</option>
                            <option value="BEFORE">Before the source</option>
                          </select>
                        </label>
                      ) : (
                        <div className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
                          Seedance preserves the source duration and aspect
                          ratio for generative edits.
                        </div>
                      )}
                    </div>
                  )}

                  {videoWorkflow === "DRAFT_FINAL" ? (
                    <div className="rounded-xl border border-primary/25 bg-primary/[0.06] p-3">
                      <p className="text-xs font-semibold text-foreground">
                        Render approved Draft at 1080p
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Creators will resolve the provider Draft server-side and
                        reuse its original prompt, sources, ratio, duration,
                        seed and audio settings.
                      </p>
                      <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                        Draft job: {sourceDraftJobId || "not selected"}
                      </p>
                    </div>
                  ) : null}
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
                  disabled={
                    busy || availableRatios.length === 0 || videoForcesAdaptive
                  }
                  className="min-h-11 rounded-xl border border-input bg-card px-3 text-foreground"
                >
                  {availableRatios.length ? (
                    (videoForcesAdaptive ? ["adaptive"] : availableRatios).map(
                      (r) => {
                        const ratioLabels: Record<string, string> = {
                          "1:1": "1:1 · Square",
                          "16:9": "16:9 · Landscape (Standard)",
                          "9:16": "9:16 · Portrait (Reels/Stories)",
                          "4:3": "4:3 · Classic Display",
                          "3:4": "3:4 · Vertical Display",
                          "3:2": "3:2 · 35mm Photography",
                          "2:3": "2:3 · Vertical Photo",
                          "21:9": "21:9 · Cinematic Ultrawide",
                          adaptive: "Adaptive · From source frame",
                        };
                        return (
                          <option key={r} value={r}>
                            {ratioLabels[r] ?? r}
                          </option>
                        );
                      },
                    )
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
                  disabled={
                    busy ||
                    availableResolutions.length === 0 ||
                    (activeMode === "VIDEO" &&
                      ["DRAFT", "DRAFT_FINAL"].includes(videoWorkflow))
                  }
                  className="min-h-11 rounded-xl border border-input bg-card px-3 text-foreground"
                >
                  {availableResolutions.length ? (
                    availableResolutions.map((value) => (
                      <option key={value} value={value}>
                        {resolutionLabel(value)}
                      </option>
                    ))
                  ) : (
                    <option>No supported resolutions advertised</option>
                  )}
                </select>

                {model?.mediaKind === "VIDEO" && (
                  <>
                    {videoWorkflow === "TALKING_AVATAR" ? (
                      <div className="rounded-xl border border-border bg-card px-3 py-3">
                        <p className="text-sm font-semibold text-foreground">
                          Duration
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Derived from driving audio
                          {validDrivingAudio.find(
                            (asset) => asset.id === drivingAudioId,
                          )?.durationMs
                            ? ` · ${(
                                validDrivingAudio.find(
                                  (asset) => asset.id === drivingAudioId,
                                )!.durationMs! / 1000
                              ).toFixed(1)}s`
                            : ""}
                        </p>
                      </div>
                    ) : videoWorkflow === "EDIT" ? (
                      <div className="rounded-xl border border-border bg-card px-3 py-3">
                        <p className="text-sm font-semibold text-foreground">
                          Duration
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Match source clip
                        </p>
                      </div>
                    ) : videoWorkflow === "DRAFT_FINAL" ? (
                      <div className="rounded-xl border border-border bg-card px-3 py-3">
                        <p className="text-sm font-semibold text-foreground">
                          Duration
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Reused from the approved Draft
                        </p>
                      </div>
                    ) : (
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
                      </>
                    )}

                    {model.capabilities?.generateAudio === true &&
                    videoWorkflow !== "DRAFT_FINAL" ? (
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

                    {model.capabilities?.outputFormatMov === true ? (
                      <label className="grid gap-2 text-sm font-semibold text-foreground">
                        Output container
                        <select
                          value={videoOutputFormat}
                          onChange={(event) =>
                            setVideoOutputFormat(
                              event.target.value as "mp4" | "mov",
                            )
                          }
                          disabled={busy}
                          className="min-h-11 rounded-xl border border-input bg-card px-3 text-foreground"
                        >
                          <option value="mp4">MP4 · playback / sharing</option>
                          <option value="mov">MOV · editing / extension</option>
                        </select>
                      </label>
                    ) : null}

                    {model.capabilities?.returnLastFrame === true ? (
                      <label className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-sm font-medium text-foreground">
                        <input
                          type="checkbox"
                          checked={returnLastFrame}
                          onChange={(event) =>
                            setReturnLastFrame(event.target.checked)
                          }
                          disabled={busy}
                          className="size-4 accent-primary"
                        />
                        Save final frame for “Continue scene”
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
                      : activeQuote.quote.estimatedUsage.unit === "SECOND"
                        ? "seconds"
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
              (activeMode === "VOICE"
                ? !voiceText.trim()
                : activeMode === "VIDEO" &&
                    (videoWorkflow === "DRAFT_FINAL" ||
                      videoWorkflow === "TALKING_AVATAR")
                  ? false
                  : !prompt.trim()) ||
              (activeMode === "VOICE" &&
                (selectedVoiceKey === "" || activeRequiredCredits === null)) ||
              (activeMode !== "VOICE" &&
                (!selectedRatio || !selectedResolution)) ||
              (model.mediaKind === "VIDEO" &&
                (!videoRequestReady ||
                  !selectedDuration ||
                  activeRequiredCredits === null)) ||
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
                    ? videoWorkflow === "TALKING_AVATAR"
                      ? "avatar"
                      : "video"
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
                : model?.providerModelId === "omnihuman-1.5"
                  ? "OmniHuman Vision generation is not configured yet."
                  : "Media generation is not configured yet."}
            </p>
          ) : null}
          {model &&
          activeMode !== "VOICE" &&
          (availableRatios.length === 0 ||
            availableResolutions.length === 0 ||
            (model.mediaKind === "VIDEO" &&
              videoWorkflow !== "TALKING_AVATAR" &&
              availableDurations.length === 0)) ? (
            <p className="text-sm text-destructive">
              This model is missing generation capabilities. Ask an admin to
              sync provider models before generating.
            </p>
          ) : null}
          {isEnhancing ? (
            <ProcessFeedback
              kind="loading"
              title="Polishing your prompt"
              description="The assistant is refining your idea. You can keep this Studio open while it finishes."
            />
          ) : null}
          {error ? (
            <ProcessFeedback
              kind={
                error.includes("temporarily") ||
                error.includes("interrupted") ||
                error.includes("retry")
                  ? "recoverable"
                  : "error"
              }
              title={
                error.includes("temporarily") ||
                error.includes("interrupted") ||
                error.includes("retry")
                  ? "We are reconnecting"
                  : "This action needs attention"
              }
              description={error}
            />
          ) : null}
        </div>
      </div>

      {isVoiceBoothOpen ? (
        <VoiceCastingBooth
          isOpen={isVoiceBoothOpen}
          onClose={() => setIsVoiceBoothOpen(false)}
          onSelectVoice={(key, rate) => {
            setVoiceKey(key);
            if (rate) setSpeechRate(rate);
          }}
          currentVoiceKey={selectedVoiceKey}
          organizationId={organizationId}
          initialTestPhrase={voiceText}
        />
      ) : null}
    </section>
  );
}
