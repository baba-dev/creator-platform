"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/creative";
import { Icon } from "@/components/ui/icon";
import { ProcessFeedback } from "@/components/process/process-feedback";
import type {
  ClarificationOption,
  ConversationState,
  CreativeModality,
} from "@/lib/conversations/types";

interface MessageItem {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  metadata?: {
    turnStatus?: string;
    generationJobId?: string;
    parentGenerationId?: string | null;
    selectedAssetId?: string;
    clarification?: {
      question: string;
      options: ClarificationOption[];
    };
    effectiveSpec?: Record<string, unknown>;
  } | null;
}

interface GenerationJobItem {
  id: string;
  status: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  providerModel?: {
    id: string;
    displayName: string;
    provider: string;
    mediaKind: string;
  } | null;
  assets: Array<{
    id: string;
    mimeType: string;
    generationOutputIndex?: number | null;
    width?: number | null;
    height?: number | null;
    durationMs?: number | null;
    thumbnailUrl?: string;
    previewUrl?: string;
    url?: string;
  }>;
}

function retryBoundedDerivative(
  image: HTMLImageElement,
  baseUrl: string,
): void {
  const attempt = Number(image.dataset.derivativeRetry ?? "0");
  if (attempt >= 3) {
    image.dataset.derivativeUnavailable = "true";
    image.style.visibility = "hidden";
    return;
  }
  const nextAttempt = attempt + 1;
  image.dataset.derivativeRetry = String(nextAttempt);
  window.setTimeout(
    () => {
      if (!image.isConnected) return;
      const separator = baseUrl.includes("?") ? "&" : "?";
      image.src = `${baseUrl}${separator}retry=${nextAttempt}`;
    },
    Math.min(1_000 * 2 ** attempt, 4_000),
  );
}

export function CreativeConversationWorkspace({
  organizationSlug,
  conversationId,
  initialTitle,
  initialState,
  initialMessages,
  initialJobs,
  canGenerate,
}: {
  organizationSlug: string;
  organizationId?: string;
  conversationId: string;
  initialTitle: string;
  initialState?: ConversationState | null;
  initialMessages: MessageItem[];
  initialJobs: GenerationJobItem[];
  canGenerate: boolean;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(initialTitle);
  const [messages, setMessages] = useState<MessageItem[]>(initialMessages);
  const [jobs, setJobs] = useState<GenerationJobItem[]>(initialJobs);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [activeAssetId, setActiveAssetId] = useState<string | null>(
    initialState?.activeAssetId ?? initialJobs[0]?.assets[0]?.id ?? null,
  );
  const [activeModality, setActiveModality] = useState<CreativeModality>(
    initialState?.activeModality ?? "IMAGE",
  );
  const [conversationRevision, setConversationRevision] = useState(
    Number(initialState?.revision ?? 0),
  );
  const [lightboxAssetId, setLightboxAssetId] = useState<string | null>(null);
  const [inputPrompt, setInputPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState(false);

  const activeJob = jobs.find((j) => j.id === selectedJobId) ?? jobs[0] ?? null;
  const isJobPending =
    activeJob?.status === "QUEUED" ||
    activeJob?.status === "PROCESSING" ||
    activeJob?.status === "SUBMITTED";

  const pendingJobs = useMemo(
    () =>
      jobs.filter(
        (j) =>
          j.status === "QUEUED" ||
          j.status === "PROCESSING" ||
          j.status === "SUBMITTED",
      ),
    [jobs],
  );
  const hasPendingJobs = pendingJobs.length > 0;

  const messageEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingTurnRef = useRef<{
    key: string;
    prompt: string;
    assetId?: string;
    sourceGenerationId?: string;
    resumePendingOperation: boolean;
  } | null>(null);

  // Poll for job status updates for any visible active jobs via batch endpoint
  useEffect(() => {
    if (!hasPendingJobs || pendingJobs.length === 0) return;
    const timer = setInterval(async () => {
      try {
        const ids = pendingJobs.map((p) => p.id).join(",");
        const res = await fetch(
          `/api/conversations/${encodeURIComponent(conversationId)}/jobs/status?ids=${encodeURIComponent(ids)}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          setRefreshError(true);
          return;
        }
        const data = await res.json();
        if (Array.isArray(data.jobs)) {
          const anyFinished = data.jobs.some(
            (job: { status?: string }) =>
              job.status === "SUCCEEDED" ||
              job.status === "FAILED" ||
              job.status === "CANCELLED" ||
              job.status === "MANUAL_REVIEW",
          );
          setJobs((prev) =>
            prev.map((existing) => {
              const updated = data.jobs.find(
                (j: { id: string }) => j.id === existing.id,
              );
              return updated ? { ...existing, ...updated } : existing;
            }),
          );
          setRefreshError(false);
          if (anyFinished) {
            void refreshConversation();
          }
        }
      } catch {
        setRefreshError(true);
      }
    }, 3000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPendingJobs, pendingJobs, conversationId]);

  // Refresh conversation details
  async function refreshConversation() {
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setRefreshError(true);
        return;
      }
      const data = await res.json();
      if (data.conversation) {
        setRefreshError(false);
        if (data.conversation.title) {
          setTitle(data.conversation.title);
          setTitleDraft(data.conversation.title);
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("aiwa:conversation-title-updated", {
                detail: { id: conversationId, title: data.conversation.title },
              }),
            );
          }
        }
        setMessages(data.conversation.messages);
        setJobs(data.conversation.generationJobs ?? []);
        if (
          data.conversation.state &&
          Object.prototype.hasOwnProperty.call(
            data.conversation.state,
            "activeAssetId",
          )
        ) {
          setActiveAssetId(data.conversation.state.activeAssetId ?? null);
        }
        if (data.conversation.state?.activeModality) {
          setActiveModality(data.conversation.state.activeModality);
        }
        setConversationRevision(Number(data.conversation.state?.revision ?? 0));
      }
    } catch {
      setRefreshError(true);
    }
  }

  // Listen for background title updates and poll for the bounded AI title task.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    function handleTitleEvent(e: Event) {
      const customEvent = e as CustomEvent<{ id: string; title: string }>;
      if (
        customEvent.detail?.id === conversationId &&
        customEvent.detail?.title &&
        !isEditingTitle
      ) {
        setTitle(customEvent.detail.title);
        setTitleDraft(customEvent.detail.title);
      }
    }
    window.addEventListener(
      "aiwa:conversation-title-updated",
      handleTitleEvent,
    );

    const pollTitle = async () => {
      let titleChanged = false;
      try {
        const res = await fetch(`/api/conversations/${conversationId}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (
          data.conversation?.title &&
          data.conversation.title !== title &&
          !isEditingTitle
        ) {
          titleChanged = true;
          setTitle(data.conversation.title);
          setTitleDraft(data.conversation.title);
          window.dispatchEvent(
            new CustomEvent("aiwa:conversation-title-updated", {
              detail: {
                id: conversationId,
                title: data.conversation.title,
              },
            }),
          );
        }
      } catch {
        // Title refinement is optional and must never block the conversation.
      } finally {
        attempts += 1;
        if (!cancelled && !titleChanged && attempts < 4) {
          timer = setTimeout(() => void pollTitle(), 3000);
        }
      }
    };

    timer = setTimeout(() => void pollTitle(), 3000);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener(
        "aiwa:conversation-title-updated",
        handleTitleEvent,
      );
    };
  }, [conversationId, isEditingTitle, title]);

  // Save renamed title
  async function saveTitle() {
    setIsEditingTitle(false);
    if (!titleDraft.trim() || titleDraft === title) return;
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: titleDraft.trim() }),
      });
      if (res.ok) {
        setTitle(titleDraft.trim());
        window.dispatchEvent(
          new CustomEvent("aiwa:conversation-title-updated", {
            detail: { id: conversationId, title: titleDraft.trim() },
          }),
        );
      }
    } catch {
      setTitleDraft(title);
    }
  }

  // Handle asset click (state-only selection: 0 credits)
  async function selectAsset(assetId: string) {
    setActiveAssetId(assetId);
    const sourceJob =
      jobs.find((job) => job.assets.some((asset) => asset.id === assetId)) ??
      activeJob;
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "Select asset",
          selectedAssetId: assetId,
          sourceGenerationId: sourceJob?.id,
          expectedRevision: conversationRevision,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRefreshError(true);
        if (data.code === "CONVERSATION_CONFLICT") {
          await refreshConversation();
        }
        return;
      }
      if (typeof data.revision === "number") {
        setConversationRevision(data.revision);
      }
    } catch {
      setRefreshError(true);
    }
  }

  // Send follow-up prompt
  async function handleSend(
    textToSend?: string,
    selectedAssetOverride?: string,
    resumePendingOperation = false,
  ) {
    const prompt = (textToSend ?? inputPrompt).trim();
    if (!prompt || isSubmitting) return;

    const wasTypedDraft = !textToSend;
    setIsSubmitting(true);
    setError(null);
    if (wasTypedDraft) {
      setInputPrompt("");
    }

    try {
      const focusedJob =
        jobs.find((job) => job.id === selectedJobId) ?? jobs[0] ?? null;
      const focusedAssetId =
        selectedAssetOverride ??
        (activeAssetId &&
        focusedJob?.assets.some((asset) => asset.id === activeAssetId)
          ? activeAssetId
          : focusedJob?.assets[0]?.id) ??
        undefined;

      const idempotencyKey =
        pendingTurnRef.current &&
        pendingTurnRef.current.prompt === prompt &&
        pendingTurnRef.current.assetId === focusedAssetId &&
        pendingTurnRef.current.sourceGenerationId === focusedJob?.id &&
        pendingTurnRef.current.resumePendingOperation === resumePendingOperation
          ? pendingTurnRef.current.key
          : crypto.randomUUID();

      pendingTurnRef.current = {
        key: idempotencyKey,
        prompt,
        assetId: focusedAssetId,
        sourceGenerationId: focusedJob?.id,
        resumePendingOperation,
      };

      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: prompt,
          selectedAssetId: focusedAssetId,
          sourceGenerationId: focusedJob?.id,
          expectedRevision: conversationRevision,
          resumePendingOperation,
          idempotencyKey,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        const needsRefresh =
          data.code === "CONVERSATION_CONFLICT" ||
          data.code === "CONVERSATION_REFRESH_REQUIRED";
        if (
          res.status >= 400 &&
          res.status < 500 &&
          res.status !== 408 &&
          res.status !== 429 &&
          !needsRefresh
        ) {
          pendingTurnRef.current = null;
        }
        if (needsRefresh) {
          await refreshConversation();
        }
        throw new Error(data.error ?? "Failed to process request.");
      }

      pendingTurnRef.current = null;
      if (typeof data.revision === "number") {
        setConversationRevision(data.revision);
      }

      if (typeof data.jobId === "string" && data.jobId) {
        setJobs((prev) => {
          if (prev.some((j) => j.id === data.jobId)) return prev;
          return [
            {
              id: data.jobId,
              status: data.status ?? "QUEUED",
              assets: [],
              providerModel: null,
            },
            ...prev,
          ];
        });
        setSelectedJobId(data.jobId);
        setActiveAssetId(null);
      }
      if (data.userMessage && data.assistantMessage) {
        setMessages((prev) => {
          const next = [...prev];
          if (!next.some((m) => m.id === data.userMessage.id)) {
            next.push(data.userMessage);
          }
          if (!next.some((m) => m.id === data.assistantMessage.id)) {
            next.push(data.assistantMessage);
          }
          return next;
        });
      }
      await refreshConversation();
    } catch (err) {
      if (wasTypedDraft) {
        setInputPrompt(prompt);
      }
      setError(err instanceof Error ? err.message : "Turn failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Active asset resolution
  const activeAsset = useMemo(() => {
    if (!activeJob?.assets || activeJob.assets.length === 0) return null;
    return (
      activeJob.assets.find((a) => a.id === activeAssetId) ??
      activeJob.assets[0] ??
      null
    );
  }, [activeJob?.assets, activeAssetId]);

  const activeAssetIndex = useMemo(() => {
    if (!activeJob?.assets || !activeAsset) return -1;
    return activeJob.assets.findIndex((a) => a.id === activeAsset.id);
  }, [activeJob?.assets, activeAsset]);

  // Contextual smart suggestions
  const quickChips = useMemo(() => {
    if (activeModality === "IMAGE") {
      return [
        { label: "Animate this (Video)", prompt: "Animate this" },
        { label: "4 variations", prompt: "Give me four variations" },
        { label: "9:16 vertical", prompt: "Make it 9:16" },
        { label: "16:9 widescreen", prompt: "Make it 16:9" },
        {
          label: "Cinematic lighting",
          prompt: "Enhance with dramatic cinematic lighting and high contrast",
        },
        { label: "Try another model", prompt: "Try another model" },
      ];
    }
    if (activeModality === "VIDEO") {
      return [
        { label: "Extend by 5s", prompt: "Extend this video by 5 seconds" },
        { label: "Try another video model", prompt: "Try another model" },
      ];
    }
    return [
      { label: "Speak faster (1.2x)", prompt: "Make it faster" },
      { label: "Speak slower (0.8x)", prompt: "Make it slower" },
    ];
  }, [activeModality]);

  // Keyboard shortcut listener for Lightbox (Esc to close)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setLightboxAssetId(null);
        setIsEditingTitle(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-6xl mx-auto px-4 py-3 sm:px-6">
      {/* Workspace Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border/70">
        <div className="flex items-center gap-2.5 min-w-0">
          <Link
            href={`/app/${organizationSlug}` as Route}
            className="grid size-8 place-items-center rounded-lg border border-border/80 bg-card text-muted-foreground hover:text-foreground transition"
            title="Back to Dashboard"
          >
            <Icon name="arrow" className="size-4 rotate-180" />
          </Link>

          {isEditingTitle ? (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void saveTitle();
                  if (e.key === "Escape") {
                    setTitleDraft(title);
                    setIsEditingTitle(false);
                  }
                }}
                autoFocus
                className="rounded-md border border-primary/50 bg-background px-2 py-0.5 text-base font-bold text-foreground outline-hidden"
              />
              <button
                type="button"
                onClick={() => void saveTitle()}
                className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground text-xs"
              >
                ✓
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <h1
                onClick={() => setIsEditingTitle(true)}
                title="Click to rename"
                className="truncate font-display text-lg font-bold text-foreground hover:underline cursor-pointer"
              >
                {title}
              </h1>
              <button
                type="button"
                onClick={() => setIsEditingTitle(true)}
                className="text-muted-foreground hover:text-foreground p-1 transition"
                title="Rename conversation"
              >
                <Icon name="edit" className="size-3.5" />
              </button>
            </div>
          )}

          <span className="hidden sm:inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
            {activeModality}
          </span>
          {activeJob?.providerModel?.displayName ? (
            <span className="hidden sm:inline-flex text-xs text-muted-foreground">
              · {activeJob.providerModel.displayName}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/app/${organizationSlug}` as Route}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/80 bg-card px-3 text-xs font-semibold text-foreground hover:border-primary/40 hover:text-primary transition"
          >
            <Icon name="plus" className="size-3.5" />
            <span>New creation</span>
          </Link>
        </div>
      </header>

      {/* Main Conversation Body */}
      <div className="flex-1 overflow-y-auto space-y-6 py-4 pr-1">
        {/* Central Visual Media Canvas */}
        <section
          aria-label="Active Generation Canvas"
          aria-live="polite"
          aria-atomic="true"
          className="rounded-2xl border border-border/80 bg-card/70 p-4 sm:p-5 shadow-xs space-y-4"
        >
          {/* Lineage Step Selector (when more than 1 job exists) */}
          {jobs.length > 1 ? (
            <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-border/60">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0">
                Lineage:
              </span>
              <div className="flex items-center gap-1.5 min-w-0">
                {jobs.map((job, idx) => {
                  const isCurrent = job.id === activeJob?.id;
                  const stepNum = jobs.length - idx;
                  return (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => {
                        setSelectedJobId(job.id);
                        if (job.assets[0]?.id) {
                          setActiveAssetId(job.assets[0].id);
                        }
                      }}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition shrink-0 ${
                        isCurrent
                          ? "bg-primary text-primary-foreground font-bold shadow-xs"
                          : "border border-border/70 bg-card text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span>Step {stepNum}</span>
                      {job.providerModel?.displayName ? (
                        <span className="opacity-75 text-[10px]">
                          ({job.providerModel.displayName})
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-2">
            <Eyebrow>Active Canvas</Eyebrow>
            {activeAssetIndex >= 0 ? (
              <span className="font-handwriting text-sm text-primary">
                ✦ Focus: Output #{activeAssetIndex + 1}
              </span>
            ) : null}
          </div>

          {isJobPending ? (
            <div className="py-12">
              <ProcessFeedback
                kind="loading"
                title="Creating your media..."
                description="Your generation is actively processing. You can send your next creative instruction while it finishes."
              />
            </div>
          ) : activeJob?.status === "FAILED" ? (
            <div className="py-6">
              <ProcessFeedback
                kind="error"
                title="Generation could not complete"
                description={
                  activeJob.errorMessage ||
                  "The provider encountered an issue. Try editing your prompt or changing the model."
                }
              />
              <div className="mt-4 flex gap-3">
                <Button size="sm" onClick={() => void handleSend("retry")}>
                  Retry
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void handleSend("Try another model")}
                >
                  Try another model
                </Button>
              </div>
            </div>
          ) : activeJob?.status === "MANUAL_REVIEW" ? (
            <div className="py-6">
              <ProcessFeedback
                kind="delayed"
                title="Under review"
                description={
                  activeJob.errorMessage ||
                  "This generation requires review before proceeding. Reserved credits are held and will be settled once verified."
                }
              />
            </div>
          ) : activeJob?.status === "CANCELLED" ? (
            <div className="py-6">
              <ProcessFeedback
                kind="recoverable"
                title="Generation cancelled"
                description="This generation was cancelled. Reserved credits have been returned to your balance."
              />
            </div>
          ) : activeJob &&
            activeJob.status === "SUCCEEDED" &&
            (!activeJob.assets || activeJob.assets.length === 0) ? (
            <div className="py-6">
              <ProcessFeedback
                kind="recoverable"
                title="Outputs unavailable"
                description="The generation finished, but no media assets were stored. Try retrying with different settings."
              />
              <div className="mt-4 flex gap-3">
                <Button size="sm" onClick={() => void handleSend("retry")}>
                  Retry
                </Button>
              </div>
            </div>
          ) : activeAsset ? (
            <div className="space-y-3">
              {/* Media Player / Canvas Preview */}
              {activeAsset.mimeType.startsWith("video/") ? (
                <div className="relative overflow-hidden rounded-xl bg-black max-h-[500px] flex items-center justify-center">
                  <video
                    controls
                    playsInline
                    src={`/api/assets/${encodeURIComponent(activeAsset.id)}`}
                    className="w-full max-h-[480px] object-contain rounded-xl"
                  />
                </div>
              ) : activeAsset.mimeType.startsWith("audio/") ? (
                <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <Icon name="voice" className="size-6 text-primary" />
                    <div>
                      <p className="text-xs font-semibold text-foreground">
                        Generated Speech Audio
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {activeJob?.providerModel?.displayName ?? "Voice Model"}
                      </p>
                    </div>
                  </div>
                  <audio
                    controls
                    src={`/api/assets/${encodeURIComponent(activeAsset.id)}`}
                    className="w-full"
                  />
                </div>
              ) : (
                <div className="group relative max-h-[520px] overflow-hidden rounded-xl border border-border/80 bg-black/5 flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={
                      activeAsset.previewUrl ??
                      `/api/assets/${encodeURIComponent(activeAsset.id)}/variant/preview`
                    }
                    onError={(e) => {
                      retryBoundedDerivative(
                        e.currentTarget,
                        activeAsset.previewUrl ??
                          `/api/assets/${encodeURIComponent(activeAsset.id)}/variant/preview`,
                      );
                    }}
                    onLoad={(e) => {
                      e.currentTarget.dataset.derivativeRetry = "0";
                      e.currentTarget.style.visibility = "visible";
                    }}
                    alt="Active Creative Canvas"
                    className="w-full max-h-[500px] object-contain rounded-xl"
                  />
                  {/* Fullscreen / Lightbox Trigger */}
                  <button
                    type="button"
                    onClick={() => setLightboxAssetId(activeAsset.id)}
                    title="Fullscreen zoom"
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 grid size-8 place-items-center rounded-lg bg-black/60 text-white backdrop-blur-xs transition hover:bg-black/80"
                  >
                    <Icon name="external" className="size-4" />
                  </button>
                </div>
              )}

              {/* Asset Action Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/60">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    Output #{activeAssetIndex + 1}
                  </span>
                  {activeAsset.width && activeAsset.height ? (
                    <span className="rounded-sm bg-surface-sunken px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                      {activeAsset.width} × {activeAsset.height}
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <a
                    href={`/api/assets/${encodeURIComponent(activeAsset.id)}`}
                    download
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-card px-2.5 py-1 font-medium text-foreground hover:border-primary/40 transition"
                    title="Download asset locally"
                  >
                    <span>Download</span>
                  </a>

                  <Link
                    href={
                      `/app/${organizationSlug}/assets?assetId=${encodeURIComponent(activeAsset.id)}` as Route
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-card px-2.5 py-1 font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition"
                    title="View in Asset Library"
                  >
                    <span>Asset Library</span>
                  </Link>

                  {activeModality === "IMAGE" ? (
                    <>
                      <Link
                        href={
                          `/app/${organizationSlug}/image?assetId=${encodeURIComponent(activeAsset.id)}` as Route
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 font-semibold text-primary hover:bg-primary/20 transition"
                        title="Open in Image Studio"
                      >
                        <span>Open Studio</span>
                      </Link>
                      <Link
                        href={
                          `/app/${organizationSlug}/image?tab=ai&assetId=${encodeURIComponent(activeAsset.id)}` as Route
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-card px-2.5 py-1 font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition"
                        title="AI Retouch & Inpainting"
                      >
                        <span>AI Retouch</span>
                      </Link>
                    </>
                  ) : activeModality === "VIDEO" ? (
                    <Link
                      href={
                        `/app/${organizationSlug}/video?assetId=${encodeURIComponent(activeAsset.id)}` as Route
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 font-semibold text-primary hover:bg-primary/20 transition"
                      title="Open in Video Studio"
                    >
                      <span>Open Studio</span>
                    </Link>
                  ) : null}
                </div>
              </div>

              {/* Variations Strip (if multiple outputs exist) */}
              {activeJob && activeJob.assets.length > 1 ? (
                <div className="pt-2">
                  <div className="flex items-center justify-between pb-1.5">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Batch Variations ({activeJob.assets.length})
                    </span>
                    <span className="font-handwriting text-xs text-muted-foreground">
                      Click to focus
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {activeJob.assets.map((asset, idx) => {
                      const isSelected = asset.id === activeAsset.id;
                      const outputNum = idx + 1;
                      return (
                        <button
                          key={asset.id}
                          type="button"
                          onClick={() => void selectAsset(asset.id)}
                          aria-label={`Select output #${outputNum}`}
                          aria-pressed={isSelected}
                          className={`group relative aspect-square overflow-hidden rounded-xl border cursor-pointer transition text-left ${
                            isSelected
                              ? "border-primary ring-2 ring-primary shadow-sm"
                              : "border-border hover:border-primary/50"
                          }`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={
                              asset.thumbnailUrl ??
                              `/api/assets/${encodeURIComponent(asset.id)}/variant/thumbnail`
                            }
                            onError={(e) => {
                              retryBoundedDerivative(
                                e.currentTarget,
                                asset.thumbnailUrl ??
                                  `/api/assets/${encodeURIComponent(asset.id)}/variant/thumbnail`,
                              );
                            }}
                            onLoad={(e) => {
                              e.currentTarget.dataset.derivativeRetry = "0";
                              e.currentTarget.style.visibility = "visible";
                            }}
                            alt={`Output #${outputNum}`}
                            className="size-full object-cover group-hover:scale-102 transition duration-200"
                            loading="lazy"
                          />
                          <span className="absolute top-1.5 left-1.5 flex size-5 items-center justify-center rounded-sm bg-black/60 text-[10px] font-bold text-white backdrop-blur-xs">
                            #{outputNum}
                          </span>
                          {isSelected ? (
                            <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold shadow-xs">
                              ✓
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {jobs.length === 0
                ? "Ready to generate your first creation. Enter a prompt below."
                : "Select a step above to view its output."}
            </div>
          )}
        </section>

        {/* Turn Timeline / Message Stream */}
        <section aria-label="Turn History" className="space-y-4 pt-2">
          {messages.map((message) => {
            const isUser = message.role === "user";
            const meta = message.metadata;
            const clarification = meta?.clarification;

            return (
              <div
                key={message.id}
                className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-2xl rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    isUser
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "border border-border/80 bg-card text-foreground shadow-2xs"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>

                  {/* Clarification prompt & interactive choices */}
                  {clarification?.options &&
                  clarification.options.length > 0 ? (
                    <div className="mt-3 pt-3 border-t border-border/60 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground">
                        Please choose an option to continue:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {clarification.options.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() =>
                              void handleSend("Select asset", opt.assetId, true)
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition"
                          >
                            <span>{opt.label}</span>
                            {opt.description ? (
                              <span className="text-[10px] text-muted-foreground">
                                · {opt.description}
                              </span>
                            ) : null}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
          <div ref={messageEndRef} />
        </section>
      </div>

      {/* Reconnection status banner */}
      {refreshError ? (
        <div className="mb-2 rounded-xl border border-warning/40 bg-warning/10 px-4 py-2.5 text-xs font-medium text-warning-foreground flex items-center justify-between gap-2">
          <span>
            We couldn’t refresh the latest status. Any accepted generation
            continues safely in the background.
          </span>
          <button
            type="button"
            onClick={() => void refreshConversation()}
            className="font-semibold underline hover:no-underline shrink-0 cursor-pointer"
          >
            Retry connection
          </button>
        </div>
      ) : null}

      {/* Error banner */}
      {error ? (
        <div className="mb-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2 text-xs font-medium text-destructive">
          {error}
        </div>
      ) : null}

      {/* Sticky Bottom Composer */}
      <footer className="pt-2 border-t border-border/70">
        {/* Quick Action Smart Chips */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            {activeAssetIndex >= 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 border border-primary/30 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                <span>✦ Output #{activeAssetIndex + 1} focused</span>
              </span>
            ) : null}

            {quickChips.map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => void handleSend(chip.prompt)}
                className="rounded-full border border-border/80 bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground transition"
              >
                {chip.label}
              </button>
            ))}
          </div>

          <span className="hidden lg:inline text-[10px] text-muted-foreground/75">
            Selection: 0 credits · Generation: standard credits
          </span>
        </div>

        {/* Composer Input Box */}
        <div className="relative flex items-end gap-2 rounded-2xl border border-border/80 bg-card p-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition">
          <textarea
            ref={textareaRef}
            rows={2}
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder="Type your next idea... (e.g. 'Make it 9:16', 'Animate this', 'Try another model')"
            disabled={!canGenerate || isSubmitting}
            maxLength={4000}
            className="flex-1 resize-none bg-transparent px-2 py-1 text-sm text-foreground outline-hidden placeholder:text-muted-foreground"
          />

          <div className="flex items-center gap-2 shrink-0 pb-1 pr-1">
            {inputPrompt.length > 500 ? (
              <span
                className={`text-[10px] tabular-nums ${
                  inputPrompt.length > 3800
                    ? "text-destructive font-semibold"
                    : "text-muted-foreground"
                }`}
              >
                {inputPrompt.length}/4000
              </span>
            ) : null}
            <span className="hidden sm:inline text-[10px] text-muted-foreground">
              ↵ Enter
            </span>
            <Button
              type="button"
              size="sm"
              onClick={() => void handleSend()}
              disabled={!inputPrompt.trim() || !canGenerate || isSubmitting}
              aria-busy={isSubmitting}
            >
              {isSubmitting ? "Planning…" : "Send"}
            </Button>
          </div>
        </div>
      </footer>

      {/* Lightbox Modal */}
      {lightboxAssetId ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Media preview"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setLightboxAssetId(null);
            }
          }}
          onClick={() => setLightboxAssetId(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[90vh] max-w-5xl overflow-hidden rounded-2xl bg-card border border-border shadow-2xl p-2 flex flex-col items-center"
          >
            {/* Close button */}
            <button
              type="button"
              autoFocus
              aria-label="Close media preview"
              onClick={() => setLightboxAssetId(null)}
              className="absolute top-4 right-4 z-10 grid size-8 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80 transition"
              title="Close (Esc)"
            >
              ✕
            </button>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/assets/${encodeURIComponent(lightboxAssetId)}`}
              alt="Fullscreen Zoom"
              className="max-h-[82vh] w-auto object-contain rounded-xl"
            />

            <div className="mt-2 flex w-full items-center justify-between px-2 pt-1 border-t border-border/60">
              <span className="text-xs text-muted-foreground">
                Creative Asset {lightboxAssetId.slice(0, 10)}…
              </span>
              <a
                href={`/api/assets/${encodeURIComponent(lightboxAssetId)}`}
                download
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                Download Original ↓
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
