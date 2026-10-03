"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/creative";
import { StatusDot, Tape } from "@/components/ui/sketch";
import { AudioWaveformPlayer } from "@/components/ui/audio-waveform-player";
import { ProcessFeedback } from "@/components/process/process-feedback";
import { announceGenerationStarted } from "@/lib/generation-activity";

interface PresetVoice {
  key: string;
  displayName: string;
  gender?: "female" | "male";
  locale: string;
  language: string;
  style?: string;
  supportedModels: string[];
}

interface ReferenceAsset {
  id: string;
  name: string;
  width: number | null;
  height: number | null;
  durationMs?: number | null;
  mimeType?: string;
  byteSize?: string;
}

interface Model {
  id: string;
  providerModelId: string;
  name: string;
  mediaKind: "IMAGE" | "VIDEO" | "VOICE";
  description?: string | null;
  priceVersionId: string;
  pricingDimension?: "REQUEST" | "CHARACTER" | "SECOND" | "TOKEN" | null;
  unitQuantity?: string | null;
  credits: string;
  capabilities?: Record<string, unknown> | null;
}

interface ProjectOption {
  id: string;
  name: string;
}

interface Job {
  id: string;
  status: string;
  errorMessage: string | null;
  reservedCredits: string;
  chargedCredits: string;
  createdAt?: string;
  videoWorkflow?: string | null;
  providerModel: {
    id: string;
    providerModelId: string;
    displayName: string;
    mediaKind: "IMAGE" | "VIDEO" | "VOICE";
  };
  project: ProjectOption | null;
  assets: {
    id: string;
    mimeType: string;
    generationOutputIndex?: number | null;
  }[];
}

interface StudioData {
  configured: boolean;
  mediaConfigured?: boolean;
  visionConfigured?: boolean;
  voiceConfigured?: boolean;
  balance: string;
  models: Model[];
  voices?: PresetVoice[];
  projects: ProjectOption[];
  jobs: Job[];
}

export function SpokespersonStudio({
  organizationId,
  organizationSlug,
  canGenerate,
  initialAssetId,
}: {
  organizationId: string;
  organizationSlug: string;
  canGenerate: boolean;
  initialAssetId?: string;
}) {
  const [data, setData] = useState<StudioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Avatar Selection State
  const [avatarAssetId, setAvatarAssetId] = useState<string>(
    initialAssetId ?? "",
  );
  const [avatarAssets, setAvatarAssets] = useState<ReferenceAsset[]>([]);
  const [avatarUploadBusy, setAvatarUploadBusy] = useState(false);

  // Audio Mode: "SCRIPT" | "AUDIO_ASSET"
  const [audioMode, setAudioMode] = useState<"SCRIPT" | "AUDIO_ASSET">(
    "SCRIPT",
  );
  const [scriptText, setScriptText] = useState(
    "Welcome to Aiwa Creator. Today we are exploring our next generation digital spokesperson studio, powered by BytePlus OmniHuman and Seed Speech.",
  );
  const [selectedVoiceKey, setSelectedVoiceKey] = useState("charlotte");
  const [speechRate, setSpeechRate] = useState(1.0);
  const [auditioning, setAuditioning] = useState(false);
  const [auditionAudioUrl, setAuditionAudioUrl] = useState<string | null>(null);

  // Existing Audio Track Selection
  const [drivingAudioId, setDrivingAudioId] = useState<string>("");
  const [audioAssets, setAudioAssets] = useState<ReferenceAsset[]>([]);
  const [audioUploadBusy, setAudioUploadBusy] = useState(false);

  // Production Settings
  const [resolution, setResolution] = useState<"720p" | "1080p">("720p");
  const [motionPrompt, setMotionPrompt] = useState("");
  const [projectId, setProjectId] = useState<string>("");

  // Pipeline Execution State
  const [generationStage, setGenerationStage] = useState<
    "idle" | "synthesizing_speech" | "generating_video" | "complete" | "error"
  >("idle");
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeVideoAssetId, setActiveVideoAssetId] = useState<string | null>(
    null,
  );
  const [stageMessage, setStageMessage] = useState<string>("");
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Background reload helper
  const loadStudioData = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/generations?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const json = (await res.json()) as StudioData;
      setData(json);
    } catch {
      // Non-fatal background refresh
    }
  }, [organizationId]);

  // Initial Studio Data Fetch
  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const res = await fetch(
          `/api/generations?organizationId=${encodeURIComponent(organizationId)}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error("Failed to load studio configuration.");
        const json = (await res.json()) as StudioData;
        if (!active) return;
        setData(json);
        const firstVoice = json.voices?.[0];
        if (firstVoice) {
          setSelectedVoiceKey((prev) => prev || firstVoice.key);
        }
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof Error ? err.message : "Failed to load studio data.",
        );
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [organizationId]);

  // Load Image assets for avatar selection
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    void fetch(
      `/api/assets?organizationId=${encodeURIComponent(organizationId)}&mediaKind=IMAGE&limit=100`,
      { signal: controller.signal, cache: "no-store" },
    )
      .then((res) => (res.ok ? res.json() : { assets: [] }))
      .then((body: { assets: ReferenceAsset[] }) => {
        if (!active) return;
        setAvatarAssets(body.assets ?? []);
        if (initialAssetId) {
          setAvatarAssetId((prev) => prev || initialAssetId);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
      controller.abort();
    };
  }, [organizationId, initialAssetId]);

  // Load Audio assets for driving audio selection
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    void fetch(
      `/api/assets?organizationId=${encodeURIComponent(organizationId)}&mediaKind=AUDIO&limit=100`,
      { signal: controller.signal, cache: "no-store" },
    )
      .then((res) => (res.ok ? res.json() : { assets: [] }))
      .then((body: { assets: ReferenceAsset[] }) => {
        if (!active) return;
        setAudioAssets(body.assets ?? []);
      })
      .catch(() => undefined);

    return () => {
      active = false;
      controller.abort();
    };
  }, [organizationId]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  // OmniHuman & Voice Models
  const omniHumanModel = useMemo(() => {
    return (
      data?.models.find(
        (m) => m.providerModelId === "omnihuman-1.5" && m.mediaKind === "VIDEO",
      ) ?? null
    );
  }, [data?.models]);

  const voiceModel = useMemo(() => {
    return (
      data?.models.find(
        (m) => m.providerModelId === "seed-tts-2.0" && m.mediaKind === "VOICE",
      ) ?? null
    );
  }, [data?.models]);

  // Filtered Valid Avatars & Audio
  const validAvatars = useMemo(() => {
    return avatarAssets.filter(
      (a) =>
        ["image/jpeg", "image/png", "image/jfif", "image/pjpeg"].includes(
          a.mimeType ?? "",
        ) &&
        Number(a.byteSize ?? 0) < 5_000_000 &&
        (a.width ?? 0) > 0 &&
        (a.height ?? 0) > 0 &&
        (a.width ?? 0) < 4096 &&
        (a.height ?? 0) < 4096,
    );
  }, [avatarAssets]);

  const selectedAvatar = useMemo(() => {
    return validAvatars.find((a) => a.id === avatarAssetId) ?? null;
  }, [validAvatars, avatarAssetId]);

  const validAudioList = useMemo(() => {
    return audioAssets.filter(
      (a) =>
        (a.mimeType ?? "").startsWith("audio/") &&
        (a.durationMs ?? 0) > 0 &&
        (a.durationMs ?? 0) <= 60_000,
    );
  }, [audioAssets]);

  const selectedAudioTrack = useMemo(() => {
    return validAudioList.find((a) => a.id === drivingAudioId) ?? null;
  }, [validAudioList, drivingAudioId]);

  // Estimated Duration and Credits Calculation
  const estimatedSeconds = useMemo(() => {
    if (audioMode === "AUDIO_ASSET" && selectedAudioTrack?.durationMs) {
      return Math.ceil(selectedAudioTrack.durationMs / 1000);
    }
    // Average speech tempo: ~15 characters per second
    const rawSec = Math.max(2, Math.ceil(scriptText.trim().length / 15));
    // Apply inverse speed rate: higher rate means shorter speech duration
    return Math.min(60, Math.max(2, Math.round(rawSec / speechRate)));
  }, [audioMode, selectedAudioTrack, scriptText, speechRate]);

  const creditBreakdown = useMemo(() => {
    const videoCreditsPerUnit = Math.max(
      0,
      Number(omniHumanModel?.credits ?? 0),
    );
    const videoUnitQuantity = Math.max(
      1,
      Number(omniHumanModel?.unitQuantity ?? 1),
    );
    const videoCredits =
      Math.ceil(estimatedSeconds / videoUnitQuantity) * videoCreditsPerUnit;

    let voiceCredits = 0;
    if (audioMode === "SCRIPT" && voiceModel) {
      const chars = scriptText.trim().length;
      const voiceCreditsPerUnit = Math.max(0, Number(voiceModel.credits ?? 0));
      const voiceUnitQuantity = Math.max(
        1,
        Number(voiceModel.unitQuantity ?? 1000),
      );
      voiceCredits = Math.ceil(chars / voiceUnitQuantity) * voiceCreditsPerUnit;
    }

    const totalCredits = videoCredits + voiceCredits;
    const balanceNum = Number(data?.balance ?? 0);
    const pricingAvailable =
      Boolean(omniHumanModel) &&
      (audioMode !== "SCRIPT" || Boolean(voiceModel));
    const hasEnoughBalance = pricingAvailable && balanceNum >= totalCredits;

    return {
      videoCredits,
      videoCreditsPerUnit,
      videoUnitQuantity,
      voiceCredits,
      totalCredits,
      pricingAvailable,
      hasEnoughBalance,
      balance: balanceNum,
    };
  }, [
    estimatedSeconds,
    audioMode,
    scriptText,
    data?.balance,
    omniHumanModel,
    voiceModel,
  ]);

  // Upload Avatar Image
  const handleAvatarUpload = async (file: File) => {
    if (!canGenerate || avatarUploadBusy) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setError("Avatar portrait must be a JPEG or PNG file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Avatar portrait must be under 5 MB.");
      return;
    }

    setAvatarUploadBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("organizationId", organizationId);
      form.append("purpose", "REFERENCE_INPUT");
      const res = await fetch("/api/assets/references", {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok || !json.asset) {
        throw new Error(json.error ?? "Failed to upload avatar portrait.");
      }
      setAvatarAssets((prev) => [json.asset, ...prev]);
      setAvatarAssetId(json.asset.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setAvatarUploadBusy(false);
    }
  };

  // Upload Driving Audio File
  const handleAudioUpload = async (file: File) => {
    if (!canGenerate || audioUploadBusy) return;
    if (
      !["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav"].includes(
        file.type,
      )
    ) {
      setError("Driving audio must be an MP3 or WAV file.");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError("Driving audio must be under 25 MB.");
      return;
    }

    setAudioUploadBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/assets/media-upload", {
        method: "POST",
        headers: {
          "x-organization-id": organizationId,
          "x-file-name": file.name,
          "content-type": file.type || "application/octet-stream",
        },
        body: file,
      });
      const json = await res.json();
      if (!res.ok || !json.asset) {
        throw new Error(json.error ?? "Failed to upload audio track.");
      }
      setAudioAssets((prev) => [json.asset, ...prev]);
      setDrivingAudioId(json.asset.id);
      setAudioMode("AUDIO_ASSET");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setAudioUploadBusy(false);
    }
  };

  // Audition Voice using /api/voices/audition
  const handleAudition = async () => {
    if (!canGenerate || auditioning) return;
    setAuditioning(true);
    setError(null);
    setAuditionAudioUrl(null);

    try {
      const textToAudition =
        scriptText.slice(0, 200).trim() || "Hello, this is an audition.";
      const res = await fetch("/api/voices/audition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          voiceKey: selectedVoiceKey,
          text: textToAudition,
          speechRate,
        }),
      });

      const body = await res.json();
      if (!res.ok || !body.jobId) {
        throw new Error(body.error ?? "Voice audition failed to initialize.");
      }

      // Poll until audition job finishes
      const pollAudition = async (): Promise<string> => {
        for (let i = 0; i < 25; i++) {
          await new Promise((r) => setTimeout(r, 1000));
          const jobRes = await fetch(
            `/api/generation-jobs/${encodeURIComponent(body.jobId)}?organizationId=${encodeURIComponent(organizationId)}`,
          );
          if (jobRes.ok) {
            const jobData = await jobRes.json();
            if (jobData.status === "SUCCEEDED" && jobData.assets?.[0]?.id) {
              return `/api/assets/${jobData.assets[0].id}`;
            }
            if (jobData.status === "FAILED") {
              throw new Error(
                jobData.errorMessage ?? "Audition synthesis failed.",
              );
            }
          }
        }
        throw new Error("Audition request timed out.");
      };

      const url = await pollAudition();
      setAuditionAudioUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Audition failed.");
    } finally {
      setAuditioning(false);
    }
  };

  // Helper to submit the OmniHuman 1.5 Video Job
  const dispatchOmniHumanJob = async (audioAssetId: string) => {
    if (!omniHumanModel) {
      throw new Error("OmniHuman 1.5 model is not available or enabled.");
    }

    setGenerationStage("generating_video");
    setStageMessage(
      "Submitting to OmniHuman 1.5 talking avatar neural engine…",
    );

    const idempotencyKey = crypto.randomUUID();
    const payload = {
      schemaVersion: 2,
      workflow: "TALKING_AVATAR",
      organizationId,
      projectId: projectId || undefined,
      modelId: omniHumanModel.id,
      priceVersionId: omniHumanModel.priceVersionId,
      idempotencyKey,
      prompt: motionPrompt.trim(),
      sources: [
        { assetId: avatarAssetId, role: "AVATAR_IMAGE", position: 0 },
        { assetId: audioAssetId, role: "DRIVING_AUDIO", position: 1 },
      ],
      aspectRatio: "adaptive",
      resolution,
      durationSeconds: -1,
      generateAudio: false,
      outputFormat: "mp4",
      returnLastFrame: false,
    };

    const res = await fetch("/api/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const body = await res.json();
    if (!res.ok || !body.jobId) {
      throw new Error(body.error ?? "Failed to queue spokesperson video.");
    }

    setActiveJobId(body.jobId);
    announceGenerationStarted(organizationId, body.jobId);
    setStageMessage(
      "OmniHuman 1.5 is rendering facial motion, lip-sync, and expressions…",
    );

    // Start polling the video job
    startJobPolling(body.jobId);
  };

  // Poll job status until complete
  const startJobPolling = (jobId: string) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);

    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/generation-jobs/${encodeURIComponent(jobId)}?organizationId=${encodeURIComponent(organizationId)}`,
        );
        if (!res.ok) return;
        const job = await res.json();

        if (job.status === "PROCESSING") {
          setStageMessage(
            "Generating realistic head motion and vocal articulation…",
          );
        } else if (job.status === "SUCCEEDED") {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          setGenerationStage("complete");
          const outputAsset = job.assets?.[0]?.id;
          if (outputAsset) {
            setActiveVideoAssetId(outputAsset);
          }
          void loadStudioData();
        } else if (job.status === "FAILED") {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          setGenerationStage("error");
          setError(job.errorMessage ?? "OmniHuman generation failed.");
          void loadStudioData();
        }
      } catch {
        // Continue polling
      }
    }, 3000);
  };

  // Primary Action: Generate Spokesperson Video
  const handleGenerate = async () => {
    if (!canGenerate) return;
    if (!avatarAssetId) {
      setError("Please select or upload an avatar portrait first.");
      return;
    }
    if (audioMode === "SCRIPT" && !scriptText.trim()) {
      setError("Please enter a speech script for the spokesperson.");
      return;
    }
    if (audioMode === "AUDIO_ASSET" && !drivingAudioId) {
      setError("Please choose or upload a driving audio track.");
      return;
    }
    if (!creditBreakdown.hasEnoughBalance) {
      setError("Insufficient credits. Please top up your workspace wallet.");
      return;
    }

    setError(null);
    setActiveVideoAssetId(null);

    // If using existing audio asset:
    if (audioMode === "AUDIO_ASSET") {
      try {
        await dispatchOmniHumanJob(drivingAudioId);
      } catch (err) {
        setGenerationStage("error");
        setError(
          err instanceof Error ? err.message : "Failed to start generation.",
        );
      }
      return;
    }

    // If synthesizing voice from script first:
    if (!voiceModel) {
      setError("Seed Speech TTS model is not available.");
      return;
    }

    setGenerationStage("synthesizing_speech");
    setStageMessage(
      `Synthesizing narration with ${selectedVoiceKey} (Seed-TTS 2.0)…`,
    );

    try {
      const voiceIdempotencyKey = crypto.randomUUID();
      const voiceRes = await fetch("/api/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          projectId: projectId || undefined,
          modelId: voiceModel.id,
          priceVersionId: voiceModel.priceVersionId,
          idempotencyKey: voiceIdempotencyKey,
          text: scriptText.trim(),
          voiceKey: selectedVoiceKey,
          speechRate,
          format: "mp3",
        }),
      });

      const voiceBody = await voiceRes.json();
      if (!voiceRes.ok || !voiceBody.jobId) {
        throw new Error(voiceBody.error ?? "Failed to synthesize voice track.");
      }

      // Poll until voice job completes to obtain the generated Audio Asset ID
      let createdAudioAssetId: string | null = null;
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const checkRes = await fetch(
          `/api/generation-jobs/${encodeURIComponent(voiceBody.jobId)}?organizationId=${encodeURIComponent(organizationId)}`,
        );
        if (checkRes.ok) {
          const checkJob = await checkRes.json();
          if (checkJob.status === "SUCCEEDED" && checkJob.assets?.[0]?.id) {
            createdAudioAssetId = checkJob.assets[0].id;
            break;
          }
          if (checkJob.status === "FAILED") {
            throw new Error(checkJob.errorMessage ?? "Voice synthesis failed.");
          }
        }
      }

      if (!createdAudioAssetId) {
        throw new Error(
          "Voice synthesis is taking unusually long. Please check the generation log before retrying.",
        );
      }

      // Step 2: Dispatch OmniHuman 1.5 Video Job with the newly created audio asset!
      await dispatchOmniHumanJob(createdAudioAssetId);
    } catch (err) {
      setGenerationStage("error");
      setError(err instanceof Error ? err.message : "Generation failed.");
    }
  };

  // Recent Spokesperson Renders
  const recentSpokespersonJobs = useMemo(() => {
    return (
      data?.jobs.filter(
        (j) =>
          j.providerModel?.providerModelId === "omnihuman-1.5" ||
          j.videoWorkflow === "TALKING_AVATAR",
      ) ?? []
    );
  }, [data?.jobs]);

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Loading Digital Spokesperson Studio…
        </div>
      </div>
    );
  }

  const isConfigured = Boolean(
    data?.visionConfigured &&
    (audioMode === "AUDIO_ASSET" || data?.voiceConfigured),
  );

  return (
    <div className="space-y-8">
      {/* Studio Header */}
      <header className="relative flex flex-col gap-4 rounded-3xl border border-border bg-card p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <Tape className="left-6 -top-2" />
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Eyebrow>Flagship Video Studio</Eyebrow>
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              OmniHuman 1.5 + Seed-TTS 2.0
            </span>
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground lg:text-3xl">
            Digital Spokesperson Studio
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Generate photorealistic, lip-synchronized talking presenters from a
            single portrait photo and script. Powered by BytePlus OmniHuman 1.5
            and Seed Speech neural narration.
          </p>
        </div>

        {/* Wallet & Balance Transparency Card */}
        <div className="flex shrink-0 items-center gap-4 rounded-2xl border border-border bg-surface-sunken p-4">
          <div className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Workspace Wallet
            </span>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-xl font-bold tabular-nums text-foreground">
                {Number(data?.balance ?? 0).toLocaleString()}
              </span>
              <span className="text-xs font-medium text-muted-foreground">
                credits
              </span>
            </div>
          </div>
          <Link
            href={`/app/${encodeURIComponent(organizationSlug)}` as Route}
            className="rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
          >
            Workspace
          </Link>
        </div>
      </header>

      {/* Configuration Advisory */}
      {!isConfigured && (
        <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4">
          <div className="flex items-start gap-3">
            <Icon name="wand" className="size-5 shrink-0 text-warning" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                Provider credentials missing for full spokesperson pipeline
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                OmniHuman 1.5 requires BytePlus Vision credentials (Access Key
                ID and Secret Access Key) and Seed Speech requires BytePlus
                Voice API tokens.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Studio Grid */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left Column: Stage Player & Avatar Selection (7 cols) */}
        <div className="space-y-6 lg:col-span-7">
          {/* Stage Viewport */}
          <div className="relative aspect-video overflow-hidden rounded-3xl border border-border bg-black/90 shadow-inner">
            {activeVideoAssetId ? (
              <div className="relative h-full w-full">
                <video
                  src={`/api/assets/${activeVideoAssetId}`}
                  controls
                  playsInline
                  autoPlay
                  className="h-full w-full object-contain"
                />
                <div className="absolute right-3 top-3 flex items-center gap-2">
                  <a
                    href={`/api/assets/${activeVideoAssetId}?download=1`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-black/60 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md transition-colors hover:bg-black/80"
                  >
                    <Icon name="arrow" className="size-3.5 rotate-90" />
                    Download MP4
                  </a>
                  <Link
                    href={
                      `/app/${encodeURIComponent(organizationSlug)}/video?assetId=${encodeURIComponent(activeVideoAssetId)}` as Route
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                  >
                    <Icon name="video" className="size-3.5" />
                    Open in Video Editor
                  </Link>
                </div>
              </div>
            ) : selectedAvatar ? (
              <div className="relative flex h-full w-full items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/assets/${selectedAvatar.id}`}
                  alt={selectedAvatar.name || "Selected Avatar Portrait"}
                  className="max-h-full max-w-full object-contain"
                />
                <div className="absolute bottom-4 left-4 rounded-xl border border-white/20 bg-black/60 px-3 py-1.5 backdrop-blur-md">
                  <p className="text-xs font-semibold text-white">
                    {selectedAvatar.name || "Portrait Active"}
                  </p>
                  <p className="text-[0.6875rem] text-white/70">
                    {selectedAvatar.width}×{selectedAvatar.height} · Ready for
                    OmniHuman
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center text-muted-foreground">
                <div className="mb-3 flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/40">
                  <Icon name="image" className="size-7" />
                </div>
                <h3 className="font-display text-base font-semibold text-white">
                  No Avatar Portrait Selected
                </h3>
                <p className="mt-1 max-w-xs text-xs text-white/60">
                  Choose a portrait from your organization library or upload a
                  front-facing portrait photo.
                </p>
              </div>
            )}

            {/* In-Flight Pipeline Overlay */}
            {generationStage !== "idle" &&
              generationStage !== "complete" &&
              generationStage !== "error" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 p-6 backdrop-blur-xs">
                  <div className="w-full max-w-md">
                    <ProcessFeedback
                      kind="loading"
                      title={
                        generationStage === "synthesizing_speech"
                          ? "Stage 1: Synthesizing Driving Audio"
                          : "Stage 2: OmniHuman 1.5 Video Generation"
                      }
                      description={stageMessage}
                      className="border-white/20 bg-black/80 text-white"
                    />
                    <div className="mt-4 flex items-center justify-between text-xs text-white/60">
                      <span>Live status updates active</span>
                      {activeJobId && (
                        <span className="font-mono">
                          Job: {activeJobId.slice(0, 10)}…
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
          </div>

          {/* Avatar Source Selector */}
          <div className="space-y-4 rounded-3xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-base font-semibold text-foreground">
                  Select Spokesperson Avatar
                </h2>
                <p className="text-xs text-muted-foreground">
                  Clear, front-facing portrait with neutral lighting ($&lt;5$MB,
                  JPEG/PNG)
                </p>
              </div>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleAvatarUpload(file);
                  }}
                  disabled={avatarUploadBusy || !canGenerate}
                />
                <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-input bg-card px-3 text-xs font-semibold text-foreground shadow-xs transition-colors hover:bg-accent">
                  <Icon name="upload" className="size-3.5" />
                  {avatarUploadBusy ? "Uploading…" : "Upload Portrait"}
                </span>
              </label>
            </div>

            <div className="rounded-2xl border border-dashed border-border bg-surface-sunken p-4 text-xs text-muted-foreground">
              Use a real portrait from your organization library or upload a new
              front-facing JPEG/PNG. Curated stock avatars are intentionally not
              shown until they are backed by licensed source assets.
            </div>

            {/* Asset Library Avatars */}
            {validAvatars.length > 0 && (
              <div className="space-y-2 pt-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  From Organization Library ({validAvatars.length})
                </span>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {validAvatars.map((asset) => {
                    const isSelected = avatarAssetId === asset.id;
                    return (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => {
                          setAvatarAssetId(asset.id);
                        }}
                        className={`group relative size-20 shrink-0 overflow-hidden rounded-2xl border transition-all ${
                          isSelected
                            ? "border-primary ring-2 ring-primary"
                            : "border-border hover:border-primary/50"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/assets/${asset.id}`}
                          alt={asset.name}
                          className="h-full w-full object-cover"
                        />
                        {isSelected && (
                          <div className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <Icon name="check" className="size-3" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Script & Generation Engine (5 cols) */}
        <div className="space-y-6 lg:col-span-5">
          <div className="space-y-6 rounded-3xl border border-border bg-card p-6 shadow-sm">
            {/* Mode Switcher */}
            <div className="flex rounded-2xl border border-border bg-surface-sunken p-1">
              <button
                type="button"
                onClick={() => setAudioMode("SCRIPT")}
                className={`flex-1 rounded-xl py-2 text-xs font-semibold transition-colors ${
                  audioMode === "SCRIPT"
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Script (Seed-TTS 2.0)
              </button>
              <button
                type="button"
                onClick={() => setAudioMode("AUDIO_ASSET")}
                className={`flex-1 rounded-xl py-2 text-xs font-semibold transition-colors ${
                  audioMode === "AUDIO_ASSET"
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Existing Audio Track
              </button>
            </div>

            {/* Scriptwriting Mode */}
            {audioMode === "SCRIPT" ? (
              <div className="space-y-4">
                {/* Script Textarea */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="spokesperson-script"
                      className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      Presenter Script
                    </label>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {scriptText.length}/1000 chars
                    </span>
                  </div>
                  <textarea
                    id="spokesperson-script"
                    rows={4}
                    maxLength={1000}
                    value={scriptText}
                    onChange={(e) => setScriptText(e.target.value)}
                    placeholder="Type the words you want your digital spokesperson to speak…"
                    className="w-full rounded-2xl border border-input bg-card p-3.5 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                  />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      Estimated length: ~
                      <strong className="text-foreground">
                        {estimatedSeconds}s
                      </strong>
                    </span>
                    <span>~15 characters/sec</span>
                  </div>
                </div>

                {/* Voice Selection */}
                <div className="space-y-2">
                  <label
                    htmlFor="voice-select"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Seed Speech Voice Preset
                  </label>
                  <select
                    id="voice-select"
                    value={selectedVoiceKey}
                    onChange={(e) => setSelectedVoiceKey(e.target.value)}
                    className="min-h-11 w-full rounded-xl border border-input bg-card px-3 text-sm font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {(data?.voices ?? []).map((voice) => (
                      <option key={voice.key} value={voice.key}>
                        {voice.displayName} ({voice.locale} ·{" "}
                        {voice.style || voice.gender || "natural"})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Speech Rate Slider */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="speech-rate-slider"
                      className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      Pacing / Speed Rate
                    </label>
                    <span className="font-mono text-xs font-bold tabular-nums text-foreground">
                      {speechRate.toFixed(2)}×
                    </span>
                  </div>
                  <input
                    id="speech-rate-slider"
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.05"
                    value={speechRate}
                    onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                    className="h-2 w-full cursor-pointer accent-primary"
                  />
                </div>

                {/* Voice Audition Player */}
                <div className="rounded-2xl border border-border bg-surface-sunken p-3.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-foreground">
                        Audition Delivery
                      </span>
                      <p className="text-[0.6875rem] text-muted-foreground">
                        Preview speech delivery before rendering full video
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => void handleAudition()}
                      disabled={auditioning || !canGenerate}
                      className="gap-1.5"
                    >
                      <Icon name="voice" className="size-3.5" />
                      {auditioning ? "Auditioning…" : "Audition Voice"}
                    </Button>
                  </div>

                  {auditionAudioUrl && (
                    <div className="mt-3">
                      <AudioWaveformPlayer
                        src={auditionAudioUrl}
                        voiceName={selectedVoiceKey}
                        title="Audition Preview"
                        autoPlay
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Audio File Mode */
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="driving-audio-select"
                      className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      Select Audio Track
                    </label>
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="audio/mp3,audio/mpeg,audio/wav"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void handleAudioUpload(file);
                        }}
                        disabled={audioUploadBusy || !canGenerate}
                      />
                      <span className="text-xs font-semibold text-primary hover:underline">
                        {audioUploadBusy ? "Uploading…" : "+ Upload audio file"}
                      </span>
                    </label>
                  </div>

                  <select
                    id="driving-audio-select"
                    value={drivingAudioId}
                    onChange={(e) => setDrivingAudioId(e.target.value)}
                    className="min-h-11 w-full rounded-xl border border-input bg-card px-3 text-sm font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <option value="">-- Choose driving audio asset --</option>
                    {validAudioList.map((audio) => (
                      <option key={audio.id} value={audio.id}>
                        {audio.name} (
                        {Math.round((audio.durationMs ?? 0) / 1000)}s)
                      </option>
                    ))}
                  </select>
                </div>

                {selectedAudioTrack && (
                  <div className="rounded-2xl border border-border bg-surface-sunken p-3">
                    <AudioWaveformPlayer
                      src={`/api/assets/${selectedAudioTrack.id}`}
                      title={selectedAudioTrack.name}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Production Settings */}
            <div className="space-y-4 border-t border-border pt-4">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="resolution-select"
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Video Resolution
                </label>
                <div className="flex gap-1 rounded-xl border border-border bg-surface-sunken p-1">
                  {(["720p", "1080p"] as const).map((res) => (
                    <button
                      key={res}
                      type="button"
                      onClick={() => setResolution(res)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
                        resolution === res
                          ? "bg-card text-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {res}
                    </button>
                  ))}
                </div>
              </div>

              {/* Motion & Expression Direction */}
              <div className="space-y-1.5">
                <label
                  htmlFor="motion-prompt-input"
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Expression & Motion Direction (Optional)
                </label>
                <input
                  id="motion-prompt-input"
                  type="text"
                  value={motionPrompt}
                  onChange={(e) => setMotionPrompt(e.target.value)}
                  placeholder="e.g. Friendly smile, natural eye contact, articulate hand gestures"
                  className="min-h-10 w-full rounded-xl border border-input bg-card px-3 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                />
              </div>

              {/* Optional Project Assignment */}
              {data?.projects?.length ? (
                <div className="space-y-1.5">
                  <label
                    htmlFor="project-select"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Assign to Project
                  </label>
                  <select
                    id="project-select"
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    className="min-h-10 w-full rounded-xl border border-input bg-card px-3 text-xs font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <option value="">No Project (Organization Root)</option>
                    {data.projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>

            {/* Error Message */}
            {error && (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs text-destructive">
                {error}
              </div>
            )}

            {/* Credit Quotation & Primary Submission */}
            <div className="space-y-3 rounded-2xl border border-border bg-surface-sunken p-4">
              <div className="space-y-1 text-xs">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>
                    OmniHuman 1.5 Video ({estimatedSeconds}s @{" "}
                    {creditBreakdown.videoCreditsPerUnit} cr/
                    {creditBreakdown.videoUnitQuantity === 1
                      ? "s"
                      : `${creditBreakdown.videoUnitQuantity}s`}
                    )
                  </span>
                  <span className="font-mono tabular-nums">
                    {creditBreakdown.videoCredits} cr
                  </span>
                </div>
                {audioMode === "SCRIPT" && (
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Seed-TTS 2.0 Speech</span>
                    <span className="font-mono tabular-nums">
                      {creditBreakdown.voiceCredits} cr
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-border pt-1 font-semibold text-foreground">
                  <span>Total Estimated Credits</span>
                  <span className="font-mono text-sm tabular-nums text-primary">
                    {creditBreakdown.totalCredits} credits
                  </span>
                </div>
              </div>

              {!creditBreakdown.pricingAvailable ? (
                <p className="text-xs font-medium text-destructive">
                  Active pricing is unavailable for the selected spokesperson
                  pipeline. Refresh the Studio or contact an operator.
                </p>
              ) : !creditBreakdown.hasEnoughBalance ? (
                <p className="text-xs font-medium text-destructive">
                  Insufficient balance ({creditBreakdown.balance} available).
                  Please top up your wallet.
                </p>
              ) : null}

              <Button
                type="button"
                onClick={() => void handleGenerate()}
                disabled={
                  !canGenerate ||
                  generationStage === "synthesizing_speech" ||
                  generationStage === "generating_video" ||
                  !creditBreakdown.hasEnoughBalance ||
                  !omniHumanModel ||
                  (audioMode === "SCRIPT" && !voiceModel) ||
                  !avatarAssetId
                }
                className="w-full gap-2 py-6 text-sm font-bold shadow-md"
              >
                <Icon name="sparkles" className="size-4" />
                {generationStage === "synthesizing_speech"
                  ? "Synthesizing Driving Narration…"
                  : generationStage === "generating_video"
                    ? "Rendering OmniHuman Video…"
                    : `Generate Spokesperson Video (${creditBreakdown.totalCredits} cr)`}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Spokesperson Generations Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">
              Recent Spokesperson Generations
            </h2>
            <p className="text-xs text-muted-foreground">
              Previous talking digital avatar renders for this workspace
            </p>
          </div>
        </div>

        {recentSpokespersonJobs.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No spokesperson videos generated yet. Launch your first presenter
            above!
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recentSpokespersonJobs.map((job) => {
              const outputAsset = job.assets?.[0]?.id;
              const tone =
                job.status === "SUCCEEDED"
                  ? "success"
                  : job.status === "FAILED"
                    ? "warning"
                    : job.status === "PROCESSING"
                      ? "primary"
                      : "info";

              return (
                <article
                  key={job.id}
                  className="flex flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-xs"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-display text-sm font-bold text-foreground">
                        {job.providerModel.displayName}
                      </span>
                      <StatusDot tone={tone}>{job.status}</StatusDot>
                    </div>

                    {outputAsset ? (
                      <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
                        <video
                          src={`/api/assets/${outputAsset}`}
                          controls
                          playsInline
                          preload="metadata"
                          className="h-full w-full object-contain"
                        />
                      </div>
                    ) : (
                      <div className="flex aspect-video items-center justify-center rounded-xl bg-surface-sunken text-xs text-muted-foreground">
                        {job.status === "FAILED"
                          ? job.errorMessage || "Generation failed"
                          : "Rendering in progress…"}
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                    <span className="font-mono tabular-nums">
                      {job.chargedCredits || job.reservedCredits} credits
                    </span>
                    {outputAsset && (
                      <button
                        type="button"
                        onClick={() => setActiveVideoAssetId(outputAsset)}
                        className="font-semibold text-primary hover:underline"
                      >
                        Play in Studio Stage →
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
