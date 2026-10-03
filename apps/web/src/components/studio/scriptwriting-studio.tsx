"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CreativeSurface, Eyebrow } from "@/components/ui/creative";
import { Icon } from "@/components/ui/icon";
import { StatusBadge } from "@/components/admin/primitives";
import { AudioWaveformPlayer } from "@/components/ui/audio-waveform-player";
import { VoiceCastingBooth } from "@/components/ui/voice-casting-booth";
import {
  StudioModelSelect,
  type StudioModelOption,
} from "@/components/studio/studio-model-select";
import {
  assembleMasterStoryAudio,
  type AssembledAudioResult,
} from "@/lib/audio-assembly";
import { runQuotedTextFeature } from "@/lib/text-feature-client";

interface SceneBlock {
  id: string;
  type: "slugline" | "action" | "dialogue";
  character?: string;
  parenthetical?: string;
  text: string;
  voiceKey?: string;
  audioJobId?: string;
  audioAssetId?: string;
}

interface CharacterVoiceAssignment {
  voiceKey: string;
  speechRate?: number;
}

interface ScriptDocument {
  id: string;
  title: string;
  logline?: string | null;
  targetDurationSeconds?: number | null;
  content: {
    scenes: SceneBlock[];
    voiceAssignments?: Record<string, CharacterVoiceAssignment>;
  };
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export const VERIFIED_VOICES = [
  {
    key: "jasper",
    name: "Jasper",
    lang: "English (US)",
    gender: "Male",
    style: "Passionate & high-spirited",
  },
  {
    key: "charlotte",
    name: "Charlotte",
    lang: "English (UK)",
    gender: "Female",
    style: "Bright & crisp",
  },
  {
    key: "kayla",
    name: "Kayla",
    lang: "English (US)",
    gender: "Female",
    style: "Enthusiastic & outgoing",
  },
  {
    key: "sunny",
    name: "Sunny (Myra)",
    lang: "English (US)",
    gender: "Female",
    style: "Crisp & lively",
  },
  {
    key: "zendaya",
    name: "Zendaya",
    lang: "English (US)",
    gender: "Female",
    style: "Relaxed & approachable",
  },
  {
    key: "sharron",
    name: "Sharron",
    lang: "English (US)",
    gender: "Female",
    style: "Gentle & calm",
  },
  {
    key: "vivi",
    name: "Vivi",
    lang: "Chinese (Mandarin)",
    gender: "Female",
    style: "Youthful & vibrant",
  },
  {
    key: "xiaohe",
    name: "Xiaohe (Amber)",
    lang: "Chinese (Mandarin)",
    gender: "Female",
    style: "Warm & natural",
  },
];

export function ScriptwritingStudio({
  organizationId,
  canGenerate,
  defaultModelId,
  textModels,
}: {
  organizationSlug?: string;
  organizationId: string;
  canGenerate: boolean;
  defaultModelId: string | null;
  textModels: StudioModelOption[];
}) {
  const [scripts, setScripts] = useState<ScriptDocument[]>([]);
  const [activeScript, setActiveScript] = useState<ScriptDocument | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // AI Assistant state
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiAction, setAiAction] = useState<"dialogue" | "continue" | "polish">(
    "dialogue",
  );
  const [selectedTextModel, setSelectedTextModel] = useState(
    defaultModelId ?? textModels[0]?.id ?? "",
  );

  // Voice synthesis & multi-voice timeline state
  const [activeTab, setActiveTab] = useState<
    "screenplay" | "timeline" | "cast"
  >("screenplay");
  const [synthesizingBlockId, setSynthesizingBlockId] = useState<string | null>(
    null,
  );
  const [selectedVoice, setSelectedVoice] = useState<string>("jasper");
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [pendingBatchQuote, setPendingBatchQuote] = useState<{
    quoteToken: string;
    idempotencyKey: string;
    estimatedCredits: string;
    maximumChargeCredits: string;
    blockCount: number;
  } | null>(null);

  // Sequential story player state
  const [isPlayingSequence, setIsPlayingSequence] = useState(false);
  const [currentPlayingBlockIndex, setCurrentPlayingBlockIndex] = useState<
    number | null
  >(null);
  const sequenceAudioRef = useRef<HTMLAudioElement | null>(null);
  const voicePollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Voice Casting Booth state
  const [castingBoothOpen, setCastingBoothOpen] = useState(false);
  const [castingCharacter, setCastingCharacter] = useState<string | null>(null);
  const [castingInitialPhrase, setCastingInitialPhrase] = useState("");

  // Master story audio assembly state
  const [interLinePause, setInterLinePause] = useState<number>(1.0);
  const [isAssemblingAudio, setIsAssemblingAudio] = useState(false);
  const [assembledMasterAudio, setAssembledMasterAudio] =
    useState<AssembledAudioResult | null>(null);
  const [isSavingMasterAsset, setIsSavingMasterAsset] = useState(false);
  const [masterAssetSaved, setMasterAssetSaved] = useState(false);
  const [assembleError, setAssembleError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (voicePollTimerRef.current) clearTimeout(voicePollTimerRef.current);
      sequenceAudioRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (assembledMasterAudio?.objectUrl) {
        URL.revokeObjectURL(assembledMasterAudio.objectUrl);
      }
    };
  }, [assembledMasterAudio]);

  function openCastingBoothForCharacter(charName: string) {
    setCastingCharacter(charName);
    const lastLine = activeScript?.content.scenes
      .filter(
        (s) =>
          s.type === "dialogue" &&
          (s.character || "").toUpperCase().trim() === charName,
      )
      .slice(-1)[0]?.text;
    setCastingInitialPhrase(
      lastLine || "I am ready to perform this character's story.",
    );
    setCastingBoothOpen(true);
  }

  async function handleExportMasterAudio() {
    if (dialogueBlocksWithAudio.length === 0) return;
    setIsAssemblingAudio(true);
    setAssembleError(null);
    setMasterAssetSaved(false);

    try {
      const clips = dialogueBlocksWithAudio.map((b) => ({
        id: b.id,
        url: `/api/assets/${b.audioAssetId}`,
        speaker: b.character,
        text: b.text,
      }));

      const result = await assembleMasterStoryAudio({
        clips,
        pauseDurationSeconds: interLinePause,
      });
      setAssembledMasterAudio(result);
    } catch (err) {
      setAssembleError(
        err instanceof Error
          ? err.message
          : "Failed to assemble master story audio.",
      );
    } finally {
      setIsAssemblingAudio(false);
    }
  }

  async function handleSaveMasterAudioToAssetLibrary() {
    if (!assembledMasterAudio || !activeScript) return;
    setIsSavingMasterAsset(true);
    setAssembleError(null);

    try {
      const cleanTitle = activeScript.title
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "-")
        .slice(0, 50);
      const fileName = `${cleanTitle}-master-story.wav`;

      const res = await fetch("/api/assets/media-upload", {
        method: "POST",
        headers: {
          "x-organization-id": organizationId,
          "x-file-name": fileName,
          "content-length": String(assembledMasterAudio.blob.size),
        },
        body: assembledMasterAudio.blob,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to upload master story audio.");
      }

      setMasterAssetSaved(true);
    } catch (err) {
      setAssembleError(
        err instanceof Error ? err.message : "Failed to save to Asset Library.",
      );
    } finally {
      setIsSavingMasterAsset(false);
    }
  }

  const handleCreateNewScript = useCallback(
    async (isInitial = false) => {
      if (!canGenerate) return;
      const defaultContent = {
        scenes: [
          {
            id: "1",
            type: "slugline" as const,
            text: "EXT. KHAREEF SALALAH - MISTY MORNING",
          },
          {
            id: "2",
            type: "action" as const,
            text: "Emerald green hills stretch into dense silver fog. A shepherd leads his flock along the ridge.",
          },
          {
            id: "3",
            type: "dialogue" as const,
            character: "HAMED",
            parenthetical: "whispering softly",
            text: "The rains bring life to what seemed silent. Listen... you can hear the waterfalls wake up.",
          },
        ],
      };

      try {
        const res = await fetch("/api/scripts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            title: isInitial ? "The Mists of Dhofar" : "Untitled Screenplay",
            logline:
              "A young traveler discovers ancient water channels beneath the southern mountains.",
            targetDurationSeconds: 120,
            content: defaultContent,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          setScripts((prev) => [data.script, ...prev]);
          setActiveScript(data.script);
        }
      } catch (err) {
        console.error("Failed to create script", err);
      }
    },
    [canGenerate, organizationId],
  );

  // Load scripts on mount
  useEffect(() => {
    async function loadScripts() {
      try {
        const res = await fetch(
          `/api/scripts?organizationId=${encodeURIComponent(organizationId)}`,
        );
        if (res.ok) {
          const data = await res.json();
          setScripts(data.scripts || []);
          if (data.scripts?.length) {
            setActiveScript(data.scripts[0]);
          } else if (canGenerate) {
            // Seed a starter sample only for members allowed to create content.
            handleCreateNewScript(true);
          }
        }
      } catch (err) {
        console.error("Failed to load scripts", err);
      }
    }
    loadScripts();
  }, [organizationId, canGenerate, handleCreateNewScript]);

  async function handleSaveScript() {
    if (!activeScript || !canGenerate) return;
    setIsSaving(true);
    setStatusMessage(null);
    try {
      const res = await fetch(
        `/api/scripts/${encodeURIComponent(activeScript.id)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: activeScript.title,
            logline: activeScript.logline,
            content: activeScript.content,
            expectedRevision: activeScript.revision,
          }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        setActiveScript(data.script);
        setScripts((prev) =>
          prev.map((item) => (item.id === data.script.id ? data.script : item)),
        );
        setPendingBatchQuote(null);
        setStatusMessage("Script saved successfully.");
        setTimeout(() => setStatusMessage(null), 3000);
      } else if (res.status === 409) {
        const fresh = await fetch(
          `/api/scripts/${encodeURIComponent(activeScript.id)}`,
          { cache: "no-store" },
        );
        if (fresh.ok) {
          const data = await fresh.json();
          setActiveScript(data.script);
          setScripts((prev) =>
            prev.map((item) =>
              item.id === data.script.id ? data.script : item,
            ),
          );
        }
        setPendingBatchQuote(null);
        setStatusMessage(
          "The screenplay changed while you were editing. Latest revision loaded; review before saving again.",
        );
      } else {
        throw new Error("Failed to save script.");
      }
    } catch {
      setStatusMessage("Failed to save script.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleAddBlock(type: "slugline" | "action" | "dialogue") {
    if (!activeScript) return;
    setPendingBatchQuote(null);
    const newBlock: SceneBlock = {
      id: String(Date.now()),
      type,
      character: type === "dialogue" ? "CHARACTER" : undefined,
      text: type === "slugline" ? "INT. LOCATION - DAY" : "",
    };
    setActiveScript({
      ...activeScript,
      content: {
        scenes: [...activeScript.content.scenes, newBlock],
      },
    });
  }

  function handleUpdateBlock(id: string, updates: Partial<SceneBlock>) {
    if (!activeScript) return;
    setPendingBatchQuote(null);
    setActiveScript({
      ...activeScript,
      content: {
        scenes: activeScript.content.scenes.map((s) =>
          s.id === id ? { ...s, ...updates } : s,
        ),
      },
    });
  }

  function handleRemoveBlock(id: string) {
    if (!activeScript) return;
    setPendingBatchQuote(null);
    setActiveScript({
      ...activeScript,
      content: {
        scenes: activeScript.content.scenes.filter((s) => s.id !== id),
      },
    });
  }

  async function handleAiGenerate() {
    if (
      !activeScript ||
      !aiPrompt.trim() ||
      isGenerating ||
      !selectedTextModel
    )
      return;
    setIsGenerating(true);
    setStatusMessage(null);

    try {
      const currentContext = activeScript.content.scenes
        .map((b) =>
          b.type === "dialogue" ? `${b.character}: ${b.text}` : b.text,
        )
        .join("\n");

      const data = await runQuotedTextFeature<{
        content: string;
        chargedCredits?: number;
      }>(`/api/scripts/${encodeURIComponent(activeScript.id)}/generate`, {
        prompt: aiPrompt,
        action: aiAction,
        currentScene: currentContext.slice(-1500),
        modelId: selectedTextModel,
      });
      const generatedText = data.content as string;

      // Append generated dialogue or action
      const newBlock: SceneBlock = {
        id: String(Date.now()),
        type: "dialogue",
        character: "AI GENERATED",
        text: generatedText,
      };

      setActiveScript({
        ...activeScript,
        content: {
          scenes: [...activeScript.content.scenes, newBlock],
        },
      });
      setAiPrompt("");
      setStatusMessage("AI dialogue added to script!");
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      setStatusMessage(
        err instanceof Error ? err.message : "AI generation failed.",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  const pollScriptVoiceJobs = useCallback((targetScriptId: string) => {
    if (voicePollTimerRef.current) clearTimeout(voicePollTimerRef.current);

    const poll = async (attempt: number): Promise<void> => {
      if (attempt > 25) return;
      try {
        const res = await fetch(
          `/api/scripts/${encodeURIComponent(targetScriptId)}`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const data = await res.json();
          if (data.script) {
            setActiveScript(data.script);
            setScripts((prev) =>
              prev.map((s) => (s.id === data.script.id ? data.script : s)),
            );
            const anyPending = data.script.content?.scenes?.some(
              (s: SceneBlock) => s.audioJobId && !s.audioAssetId,
            );
            if (!anyPending) return;
          }
        }
      } catch {
        // Transient refresh failures are retried with bounded backoff.
      }

      voicePollTimerRef.current = setTimeout(
        () => {
          void poll(attempt + 1);
        },
        Math.min(1500 + attempt * 250, 5000),
      );
    };

    void poll(1);
  }, []);

  async function handleSynthesizeDialogue(block: SceneBlock) {
    if (!activeScript || !block.text.trim()) return;
    setVoiceNotice("Synthesizing audio via BytePlus Seed Speech TTS 2.0...");

    const charName = (block.character || "").toUpperCase().trim();
    const assignment = activeScript.content.voiceAssignments?.[charName];
    const voiceToUse = selectedVoice || assignment?.voiceKey || "jasper";
    const speedToUse = assignment?.speechRate ?? 1.0;

    try {
      const res = await fetch(
        `/api/scripts/${encodeURIComponent(activeScript.id)}/synthesize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: block.text,
            voiceKey: voiceToUse,
            speechRate: speedToUse,
            blockId: block.id,
          }),
        },
      );

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || "Voice synthesis failed.");
      }

      const data = await res.json();
      setVoiceNotice(
        `Speech generation queued! Job ID: ${data.jobId.slice(0, 8)}... (Tracking in Audio Timeline)`,
      );
      setSynthesizingBlockId(null);
      pollScriptVoiceJobs(activeScript.id);
      setTimeout(() => setVoiceNotice(null), 5000);
    } catch (err) {
      setVoiceNotice(err instanceof Error ? err.message : "Synthesis failed.");
    } finally {
      setSynthesizingBlockId(null);
    }
  }

  async function handleBatchSynthesize() {
    if (!activeScript || isGenerating) return;
    setIsGenerating(true);
    try {
      const endpoint = `/api/scripts/${encodeURIComponent(activeScript.id)}/synthesize-batch`;

      if (!pendingBatchQuote) {
        const idempotencyKey = crypto.randomUUID();
        const quoteResponse = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "quote", idempotencyKey }),
        });
        const data = await quoteResponse.json().catch(() => ({}));
        if (!quoteResponse.ok)
          throw new Error(data.error || "Batch quote failed.");
        const quote = data.quote;
        setPendingBatchQuote({
          quoteToken: quote.quoteToken,
          idempotencyKey,
          estimatedCredits: quote.estimatedCredits,
          maximumChargeCredits: quote.maximumChargeCredits,
          blockCount: quote.blockCount,
        });
        setVoiceNotice(
          `Estimated ${quote.estimatedCredits} credits for ${quote.blockCount} lines (max ${quote.maximumChargeCredits}). Click “Confirm batch” to queue them.`,
        );
        return;
      }

      setVoiceNotice("Queueing the authorized Seed Speech TTS 2.0 batch...");
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "generate",
          idempotencyKey: pendingBatchQuote.idempotencyKey,
          quoteToken: pendingBatchQuote.quoteToken,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 207)
        throw new Error(data.error || "Batch voice synthesis failed.");

      const failedCount = Number(data.failedCount ?? 0);
      const conflicts = Array.isArray(data.attachmentConflicts)
        ? data.attachmentConflicts.length
        : 0;
      setPendingBatchQuote(null);
      setVoiceNotice(
        failedCount > 0 || conflicts > 0
          ? `Queued ${data.queuedCount} voice jobs; ${failedCount} failed and ${conflicts} edited line(s) were left untouched.`
          : `Queued ${data.queuedCount} dialogue voice jobs within the authorized ${data.authorizedCredits} credit maximum.`,
      );
      if (data.queuedCount > 0) pollScriptVoiceJobs(activeScript.id);
      setTimeout(() => setVoiceNotice(null), 6000);
    } catch (err) {
      setPendingBatchQuote(null);
      setVoiceNotice(
        err instanceof Error ? err.message : "Batch synthesis failed.",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  // Extract unique character names from dialogue blocks
  const characters = Array.from(
    new Set(
      (activeScript?.content.scenes || [])
        .filter((b) => b.type === "dialogue" && b.character?.trim())
        .map((b) => b.character!.toUpperCase().trim()),
    ),
  );

  function handleAssignVoice(
    charName: string,
    voiceKey: string,
    speechRate: number = 1.0,
  ) {
    if (!activeScript) return;
    setPendingBatchQuote(null);
    const currentAssignments = activeScript.content.voiceAssignments || {};
    const updatedAssignments = {
      ...currentAssignments,
      [charName]: { voiceKey, speechRate },
    };
    setActiveScript({
      ...activeScript,
      content: {
        ...activeScript.content,
        voiceAssignments: updatedAssignments,
      },
    });
  }

  // Master sequence audio player
  const dialogueBlocksWithAudio = (activeScript?.content.scenes || []).filter(
    (b) => b.type === "dialogue" && b.audioAssetId,
  );

  function stopSequence() {
    if (sequenceAudioRef.current) {
      sequenceAudioRef.current.pause();
      sequenceAudioRef.current.currentTime = 0;
    }
    setIsPlayingSequence(false);
    setCurrentPlayingBlockIndex(null);
  }

  function playSequenceFromIndex(index: number) {
    if (index >= dialogueBlocksWithAudio.length) {
      stopSequence();
      return;
    }
    const block = dialogueBlocksWithAudio[index];
    if (!block || !block.audioAssetId) {
      if (block) {
        playSequenceFromIndex(index + 1);
      } else {
        stopSequence();
      }
      return;
    }
    setCurrentPlayingBlockIndex(index);
    setIsPlayingSequence(true);

    if (!sequenceAudioRef.current) {
      sequenceAudioRef.current = new Audio();
    }
    const audio = sequenceAudioRef.current;
    audio.src = `/api/assets/${block.audioAssetId}`;
    audio.onended = () => {
      setTimeout(() => {
        playSequenceFromIndex(index + 1);
      }, 400);
    };
    audio.onerror = () => {
      playSequenceFromIndex(index + 1);
    };
    audio.play().catch(() => stopSequence());
  }

  // Calculate estimated reading time
  const totalWords =
    activeScript?.content.scenes.reduce(
      (sum, block) => sum + block.text.split(/\s+/).filter(Boolean).length,
      0,
    ) || 0;
  const estimatedSeconds = Math.round((totalWords / 130) * 60);

  return (
    <div className="mx-auto flex h-[calc(100vh-65px)] max-w-[1600px] flex-col p-4 sm:p-6 lg:p-8">
      {/* Studio Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Eyebrow>Writing Desk & Speech Bridge</Eyebrow>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold text-primary">
              Seed Speech TTS 2.0 Integrated
            </span>
          </div>
          <h1 className="font-display mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Scriptwriting Studio
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Craft scenes, polish dialogue with AI, and synthesize lines into
            natural voice audio with 1-click.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleCreateNewScript()}
            disabled={!canGenerate}
          >
            <Icon name="plus" className="size-3.5" /> New Script
          </Button>

          <Button
            size="sm"
            onClick={handleSaveScript}
            disabled={isSaving || !canGenerate}
          >
            {isSaving ? "Saving..." : "Save Script"}
          </Button>
        </div>
      </div>

      {statusMessage && (
        <div className="mt-2 rounded-xl border border-primary/40 bg-primary/10 p-2 text-center text-xs font-semibold text-primary">
          {statusMessage}
        </div>
      )}

      {voiceNotice && (
        <div className="mt-2 rounded-xl border border-warning/40 bg-warning/10 p-2 text-center text-xs font-semibold text-warning">
          {voiceNotice}
        </div>
      )}

      {/* Main Studio Grid */}
      <div className="mt-4 grid min-h-0 flex-1 gap-6 lg:grid-cols-[280px_1fr_340px]">
        {/* Left: Scripts Library */}
        <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card/60 p-3">
          <div className="px-2 pb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Your Scripts
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto pr-1">
            {scripts.map((s) => {
              const isActive = activeScript?.id === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    setPendingBatchQuote(null);
                    setActiveScript(s);
                  }}
                  className={`flex w-full flex-col rounded-xl p-3 text-left transition ${
                    isActive
                      ? "border border-primary/50 bg-primary/10 text-primary"
                      : "border border-border bg-surface-sunken text-foreground hover:border-border/80"
                  }`}
                >
                  <span className="text-xs font-bold truncate">{s.title}</span>
                  {s.logline && (
                    <span className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">
                      {s.logline}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Center: Screenplay Page Editor, Audio Timeline, and Character Cast */}
        <CreativeSurface className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {activeScript && (
            <>
              {/* Script Header Bar */}
              <div className="flex flex-wrap items-center justify-between border-b border-border bg-surface-sunken/40 px-6 py-3">
                <div className="flex-1">
                  <input
                    type="text"
                    value={activeScript.title}
                    onChange={(e) =>
                      setActiveScript({
                        ...activeScript,
                        title: e.target.value,
                      })
                    }
                    className="font-display bg-transparent text-lg font-bold text-foreground focus:outline-none"
                  />
                  <input
                    type="text"
                    value={activeScript.logline || ""}
                    placeholder="Add a logline..."
                    onChange={(e) =>
                      setActiveScript({
                        ...activeScript,
                        logline: e.target.value,
                      })
                    }
                    className="mt-0.5 block w-full bg-transparent text-xs text-muted-foreground focus:outline-none"
                  />
                </div>
                <div className="text-right text-[11px] text-muted-foreground">
                  <div>{totalWords} words</div>
                  <div className="font-semibold text-primary">
                    ~{estimatedSeconds}s read time
                  </div>
                </div>
              </div>

              {/* View Tabs */}
              <div className="flex items-center gap-1 border-b border-border bg-surface-sunken/20 px-6 py-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("screenplay")}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    activeTab === "screenplay"
                      ? "bg-card text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Screenplay Editor
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("timeline")}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    activeTab === "timeline"
                      ? "bg-card text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon name="voice" className="size-3.5" />
                  <span>Story Audio Timeline</span>
                  {dialogueBlocksWithAudio.length > 0 && (
                    <span className="rounded-full bg-primary/15 px-1.5 py-0.2 text-[10px] font-bold text-primary">
                      {dialogueBlocksWithAudio.length}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("cast")}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    activeTab === "cast"
                      ? "bg-card text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon name="chat" className="size-3.5" />
                  <span>Character Voice Cast</span>
                  {characters.length > 0 && (
                    <span className="rounded-full bg-primary/15 px-1.5 py-0.2 text-[10px] font-bold text-primary">
                      {characters.length}
                    </span>
                  )}
                </button>
              </div>

              {/* View 1: Screenplay Editor Canvas */}
              {activeTab === "screenplay" && (
                <div className="flex-1 space-y-4 overflow-y-auto p-6 font-mono text-xs sm:p-8">
                  {activeScript.content.scenes.map((block) => (
                    <div
                      key={block.id}
                      className="group relative rounded-xl border border-transparent p-2 transition hover:border-border hover:bg-card/40"
                    >
                      {/* Slugline */}
                      {block.type === "slugline" && (
                        <input
                          type="text"
                          value={block.text}
                          onChange={(e) =>
                            handleUpdateBlock(block.id, {
                              text: e.target.value,
                            })
                          }
                          className="w-full bg-transparent font-bold uppercase tracking-wider text-foreground focus:outline-none"
                        />
                      )}

                      {/* Action Line */}
                      {block.type === "action" && (
                        <textarea
                          rows={2}
                          value={block.text}
                          onChange={(e) =>
                            handleUpdateBlock(block.id, {
                              text: e.target.value,
                            })
                          }
                          className="w-full resize-none bg-transparent leading-relaxed text-foreground/90 focus:outline-none"
                        />
                      )}

                      {/* Dialogue Line */}
                      {block.type === "dialogue" && (
                        <div className="mx-auto max-w-md space-y-1 text-center font-sans">
                          <input
                            type="text"
                            value={block.character || "CHARACTER"}
                            onChange={(e) =>
                              handleUpdateBlock(block.id, {
                                character: e.target.value.toUpperCase(),
                              })
                            }
                            className="w-full bg-transparent text-center font-bold uppercase text-primary focus:outline-none"
                          />
                          <input
                            type="text"
                            value={block.parenthetical || ""}
                            placeholder="(parenthetical)"
                            onChange={(e) =>
                              handleUpdateBlock(block.id, {
                                parenthetical: e.target.value,
                              })
                            }
                            className="w-full bg-transparent text-center text-[11px] italic text-muted-foreground focus:outline-none"
                          />
                          <textarea
                            rows={2}
                            value={block.text}
                            onChange={(e) =>
                              handleUpdateBlock(block.id, {
                                text: e.target.value,
                              })
                            }
                            className="w-full resize-none bg-transparent text-center font-mono leading-relaxed text-foreground focus:outline-none"
                          />

                          {/* Inline Audio Player or Synthesize Button */}
                          <div className="pt-1.5">
                            {block.audioAssetId ? (
                              <AudioWaveformPlayer
                                src={`/api/assets/${block.audioAssetId}`}
                                speakerName={block.character}
                                voiceName="Seed TTS 2.0"
                                className="mt-2"
                              />
                            ) : block.audioJobId ? (
                              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] font-medium text-primary">
                                <span className="size-1.5 animate-ping rounded-full bg-primary" />
                                <span>Synthesizing voice audio...</span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setSynthesizingBlockId(block.id)}
                                className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold text-primary transition hover:bg-primary/20"
                              >
                                <Icon name="voice" className="size-3" />
                                Synthesize Line (TTS 2.0)
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Block Action Controls */}
                      <div className="absolute top-2 right-2 hidden gap-1 opacity-80 group-hover:flex">
                        <button
                          type="button"
                          onClick={() => handleRemoveBlock(block.id)}
                          className="rounded p-1 text-destructive hover:bg-destructive/10"
                          title="Remove Block"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Add Block Toolbar */}
                  <div className="flex justify-center gap-2 border-t border-border/50 pt-4 font-sans">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleAddBlock("slugline")}
                      className="text-xs"
                    >
                      + Scene Heading
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleAddBlock("action")}
                      className="text-xs"
                    >
                      + Action
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleAddBlock("dialogue")}
                      className="text-xs"
                    >
                      + Dialogue
                    </Button>
                  </div>
                </div>
              )}

              {/* View 2: Story Audio Timeline & Sequence Player */}
              {activeTab === "timeline" && (
                <div className="flex flex-1 flex-col overflow-hidden p-6 sm:p-8">
                  {/* Master Sequencer Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          if (isPlayingSequence) {
                            stopSequence();
                          } else {
                            playSequenceFromIndex(0);
                          }
                        }}
                        disabled={dialogueBlocksWithAudio.length === 0}
                        className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition shadow-xs ${
                          isPlayingSequence
                            ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            : "bg-primary text-primary-foreground hover:bg-primary/90"
                        } disabled:opacity-50`}
                      >
                        <Icon
                          name={isPlayingSequence ? "activity" : "voice"}
                          className="size-4"
                        />
                        <span>
                          {isPlayingSequence
                            ? "Stop Sequence"
                            : "Play Full Story / Scene"}
                        </span>
                      </button>

                      {isPlayingSequence &&
                        currentPlayingBlockIndex !== null && (
                          <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                            <span className="size-2 animate-ping rounded-full bg-primary" />
                            <span>
                              Playing line {currentPlayingBlockIndex + 1} of{" "}
                              {dialogueBlocksWithAudio.length}:{" "}
                              {dialogueBlocksWithAudio[currentPlayingBlockIndex]
                                ?.character || "Character"}
                            </span>
                          </div>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      {/* Inter-Line Pause Pacing Selector */}
                      <label className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground">
                        <span className="text-muted-foreground">Pause:</span>
                        <select
                          value={interLinePause}
                          onChange={(e) =>
                            setInterLinePause(Number.parseFloat(e.target.value))
                          }
                          className="bg-transparent text-xs font-bold text-foreground focus:outline-none"
                        >
                          <option value="0.5">0.5s (Fast)</option>
                          <option value="1.0">1.0s (Natural)</option>
                          <option value="1.5">1.5s (Dramatic)</option>
                          <option value="2.0">2.0s (Theatrical)</option>
                        </select>
                      </label>

                      {/* Export Master Story Audio Button */}
                      <Button
                        size="sm"
                        variant="default"
                        onClick={handleExportMasterAudio}
                        disabled={
                          dialogueBlocksWithAudio.length === 0 ||
                          isAssemblingAudio
                        }
                        className="gap-1.5 text-xs font-semibold shadow-xs"
                      >
                        {isAssemblingAudio ? (
                          <>
                            <span className="size-2 animate-ping rounded-full bg-primary-foreground" />
                            <span>Assembling Story Audio...</span>
                          </>
                        ) : (
                          <>
                            <Icon name="wand" className="size-3.5" />
                            <span>Export Master Audio</span>
                          </>
                        )}
                      </Button>

                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleBatchSynthesize}
                        disabled={isGenerating}
                        className="gap-1.5 text-xs font-semibold"
                      >
                        <Icon name="voice" className="size-3.5" />
                        <span>
                          {pendingBatchQuote
                            ? `Confirm batch · ${pendingBatchQuote.maximumChargeCredits} credits max`
                            : "Synthesize All Lines"}
                        </span>
                      </Button>
                    </div>
                  </div>

                  {/* Assembled Master Story Audio Card */}
                  {assembledMasterAudio && (
                    <div className="mt-4 rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-foreground">
                              Master Story Audio Track
                            </h4>
                            <StatusBadge tone="success">
                              {assembledMasterAudio.totalClipsCount} dialogue
                              lines merged
                            </StatusBadge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Concatenated with {interLinePause}s inter-line
                            pacing (Duration:{" "}
                            {Math.round(assembledMasterAudio.durationSeconds)}
                            s). Ready to download or persist to your Asset
                            Library.
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <a
                            href={assembledMasterAudio.objectUrl}
                            download={`${activeScript.title.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}-master-story.wav`}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted"
                          >
                            <Icon
                              name="upload"
                              className="size-3.5 rotate-180"
                            />
                            <span>Download WAV</span>
                          </a>

                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={handleSaveMasterAudioToAssetLibrary}
                            disabled={isSavingMasterAsset || masterAssetSaved}
                            className="gap-1.5 text-xs font-semibold"
                          >
                            {masterAssetSaved ? (
                              <>
                                <Icon
                                  name="check"
                                  className="size-3.5 text-success"
                                />
                                <span>Saved to Library</span>
                              </>
                            ) : isSavingMasterAsset ? (
                              <span>Saving Asset...</span>
                            ) : (
                              <>
                                <Icon name="assets" className="size-3.5" />
                                <span>Save to Asset Library</span>
                              </>
                            )}
                          </Button>
                        </div>
                      </div>

                      <div className="mt-3.5">
                        <AudioWaveformPlayer
                          src={assembledMasterAudio.objectUrl}
                          speakerName="Master Story Track"
                          voiceName={`${interLinePause}s Pacing`}
                          title={activeScript.title}
                        />
                      </div>
                    </div>
                  )}

                  {/* Assembly Error Notice */}
                  {assembleError && (
                    <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                      {assembleError}
                    </div>
                  )}

                  {/* Timeline Blocks */}
                  <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
                    {activeScript.content.scenes.map((block, idx) => {
                      const charName = (block.character || "")
                        .toUpperCase()
                        .trim();
                      const assignedVoice =
                        activeScript.content.voiceAssignments?.[charName];

                      return (
                        <div
                          key={block.id}
                          className={`flex items-start gap-4 rounded-xl border p-3.5 transition ${
                            isPlayingSequence &&
                            dialogueBlocksWithAudio[
                              currentPlayingBlockIndex ?? -1
                            ]?.id === block.id
                              ? "border-primary bg-primary/10 shadow-md ring-2 ring-primary/30"
                              : "border-border bg-card/60"
                          }`}
                        >
                          <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-sunken text-xs font-bold text-muted-foreground">
                            {idx + 1}
                          </div>

                          <div className="min-w-0 flex-1">
                            {block.type === "slugline" && (
                              <div className="text-xs font-bold uppercase tracking-wider text-primary">
                                {block.text}
                              </div>
                            )}

                            {block.type === "action" && (
                              <div className="text-xs italic text-muted-foreground">
                                {block.text}
                              </div>
                            )}

                            {block.type === "dialogue" && (
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-foreground">
                                    {block.character || "CHARACTER"}
                                  </span>
                                  {block.parenthetical && (
                                    <span className="text-[11px] italic text-muted-foreground">
                                      ({block.parenthetical})
                                    </span>
                                  )}
                                  <span className="flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                                    <Icon name="voice" className="size-2.5" />
                                    <span>
                                      {assignedVoice
                                        ? VERIFIED_VOICES.find(
                                            (v) =>
                                              v.key === assignedVoice.voiceKey,
                                          )?.name || assignedVoice.voiceKey
                                        : "Jasper"}
                                      {assignedVoice?.speechRate &&
                                      assignedVoice.speechRate !== 1
                                        ? ` (${assignedVoice.speechRate}x)`
                                        : ""}
                                    </span>
                                  </span>
                                </div>

                                <p className="mt-1 text-xs leading-relaxed text-foreground/90">
                                  &quot;{block.text}&quot;
                                </p>

                                <div className="mt-2.5">
                                  {block.audioAssetId ? (
                                    <AudioWaveformPlayer
                                      src={`/api/assets/${block.audioAssetId}`}
                                      speakerName={block.character}
                                      voiceName="Seed TTS 2.0"
                                      className="max-w-xl"
                                    />
                                  ) : block.audioJobId ? (
                                    <div className="inline-flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs text-primary">
                                      <span className="size-1.5 animate-ping rounded-full bg-primary" />
                                      <span>
                                        Synthesizing audio (Seed TTS 2.0)...
                                      </span>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleSynthesizeDialogue(block)
                                      }
                                      className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold text-primary transition hover:bg-primary/20"
                                    >
                                      <Icon name="voice" className="size-3" />
                                      Synthesize Line
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* View 3: Character Voice Cast Manager */}
              {activeTab === "cast" && (
                <div className="flex-1 overflow-y-auto p-6 sm:p-8">
                  <div className="max-w-2xl">
                    <Eyebrow>Character Voice Cast</Eyebrow>
                    <h3 className="font-display mt-1 text-lg font-bold text-foreground">
                      Assign Seed Speech Voices to Script Roles
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Map each character to a distinct BytePlus Seed Speech TTS
                      2.0 voice and playback speed. All dialogues for that
                      character will automatically synthesize with the assigned
                      voice.
                    </p>

                    {characters.length === 0 ? (
                      <div className="mt-6 rounded-2xl border border-dashed border-border p-8 text-center">
                        <Icon
                          name="chat"
                          className="mx-auto size-8 text-muted-foreground/50"
                        />
                        <h4 className="mt-2 text-sm font-semibold text-foreground">
                          No characters found in script
                        </h4>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Add dialogue blocks in the Screenplay Editor with
                          character names (e.g. HAMED, LAYLA) to configure their
                          voices.
                        </p>
                      </div>
                    ) : (
                      <div className="mt-6 space-y-4">
                        {characters.map((charName) => {
                          const assignment = activeScript.content
                            .voiceAssignments?.[charName] || {
                            voiceKey: "jasper",
                            speechRate: 1.0,
                          };
                          const lineCount = activeScript.content.scenes.filter(
                            (s) =>
                              s.type === "dialogue" &&
                              (s.character || "").toUpperCase().trim() ===
                                charName,
                          ).length;

                          return (
                            <div
                              key={charName}
                              className="rounded-2xl border border-border bg-card p-4 shadow-xs"
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <h4 className="text-sm font-bold text-foreground">
                                    {charName}
                                  </h4>
                                  <span className="text-[11px] text-muted-foreground">
                                    {lineCount} dialogue{" "}
                                    {lineCount === 1 ? "line" : "lines"}
                                  </span>
                                </div>
                                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold text-primary">
                                  {VERIFIED_VOICES.find(
                                    (v) => v.key === assignment.voiceKey,
                                  )?.gender === "Female"
                                    ? "Female"
                                    : "Male"}
                                </span>
                              </div>

                              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                <div>
                                  <div className="flex items-center justify-between">
                                    <label className="block text-xs font-semibold text-foreground">
                                      Assigned Voice
                                    </label>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        openCastingBoothForCharacter(charName)
                                      }
                                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                                    >
                                      <Icon name="voice" className="size-3" />
                                      <span>Audition in Booth →</span>
                                    </button>
                                  </div>
                                  <select
                                    value={assignment.voiceKey}
                                    onChange={(e) =>
                                      handleAssignVoice(
                                        charName,
                                        e.target.value,
                                        assignment.speechRate ?? 1.0,
                                      )
                                    }
                                    className="mt-1 w-full rounded-xl border border-border bg-surface-sunken p-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                                  >
                                    {VERIFIED_VOICES.map((v) => (
                                      <option key={v.key} value={v.key}>
                                        {v.name} ({v.lang} • {v.style})
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                <div>
                                  <label className="block text-xs font-semibold text-foreground">
                                    Speech Rate ({assignment.speechRate ?? 1.0}
                                    ×)
                                  </label>
                                  <select
                                    value={String(assignment.speechRate ?? 1.0)}
                                    onChange={(e) =>
                                      handleAssignVoice(
                                        charName,
                                        assignment.voiceKey,
                                        parseFloat(e.target.value),
                                      )
                                    }
                                    className="mt-1 w-full rounded-xl border border-border bg-surface-sunken p-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                                  >
                                    <option value="0.75">
                                      0.75× (Deliberate)
                                    </option>
                                    <option value="1.0">1.0× (Normal)</option>
                                    <option value="1.25">
                                      1.25× (Energetic)
                                    </option>
                                    <option value="1.5">1.5× (Fast)</option>
                                  </select>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </CreativeSurface>

        {/* Right: AI Writing Assistant */}
        <div className="flex flex-col gap-4 overflow-y-auto">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
            <Eyebrow>Screenplay AI Aid</Eyebrow>
            <h3 className="font-display mt-2 text-base font-bold text-foreground">
              Dialogue & Scene Expander
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Use any configured model verified for screenplay generation.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-foreground">
                  Writing Model
                </label>
                <StudioModelSelect
                  models={textModels}
                  value={selectedTextModel}
                  onChange={(value) => {
                    setSelectedTextModel(value);
                    setStatusMessage(null);
                  }}
                  ariaLabel="Scriptwriting model"
                  className="mt-1 w-full"
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {textModels.find((model) => model.id === selectedTextModel)
                    ?.description ?? "No scriptwriting model available."}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground">
                  Action
                </label>
                <div className="mt-1 flex gap-1">
                  {[
                    { id: "dialogue", label: "Write Line" },
                    { id: "continue", label: "Continue" },
                    { id: "polish", label: "Polish" },
                  ].map((act) => (
                    <button
                      key={act.id}
                      onClick={() =>
                        setAiAction(
                          act.id as "dialogue" | "continue" | "polish",
                        )
                      }
                      className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${
                        aiAction === act.id
                          ? "bg-primary text-primary-foreground"
                          : "border border-border bg-surface-sunken text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {act.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground">
                  Instruction / Prompt
                </label>
                <textarea
                  rows={3}
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="e.g. Write a tense disagreement between Salim and the merchant about spice prices..."
                  className="mt-1 w-full rounded-xl border border-border bg-surface-sunken p-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <Button
                size="sm"
                className="w-full"
                onClick={handleAiGenerate}
                disabled={
                  !aiPrompt.trim() ||
                  isGenerating ||
                  !canGenerate ||
                  !selectedTextModel
                }
              >
                {isGenerating ? "Generating Line..." : "Generate with AI"}
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface-sunken p-4 text-xs text-muted-foreground">
            <div className="font-semibold text-foreground">
              Speech Studio Integration
            </div>
            <p className="mt-1 leading-relaxed">
              Every dialogue block has an instant{" "}
              <span className="font-semibold text-primary">
                Synthesize Line
              </span>{" "}
              action that connects directly with BytePlus Seed Speech TTS 2.0
              without retyping.
            </p>
          </div>
        </div>
      </div>

      {/* Voice Synthesis Modal */}
      {synthesizingBlockId && activeScript && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
            <h3 className="font-display text-lg font-bold text-foreground">
              Synthesize Dialogue Line
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Render this line into natural speech audio with BytePlus Seed
              Speech TTS 2.0.
            </p>

            {(() => {
              const block = activeScript.content.scenes.find(
                (s) => s.id === synthesizingBlockId,
              );
              if (!block) return null;
              return (
                <div className="mt-4 space-y-4">
                  <div className="rounded-xl border border-border bg-surface-sunken p-3 text-xs italic text-foreground">
                    &quot;{block.text}&quot;
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-foreground">
                      Select Voice
                    </label>
                    <select
                      value={selectedVoice}
                      onChange={(e) => setSelectedVoice(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-border bg-card p-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {VERIFIED_VOICES.map((v) => (
                        <option key={v.key} value={v.key}>
                          {v.name} ({v.lang} • {v.style})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setSynthesizingBlockId(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleSynthesizeDialogue(block)}
                    >
                      Synthesize to Audio
                    </Button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Voice Casting Booth Modal */}
      {castingBoothOpen && castingCharacter && (
        <VoiceCastingBooth
          isOpen={castingBoothOpen}
          onClose={() => setCastingBoothOpen(false)}
          organizationId={organizationId}
          characterName={castingCharacter}
          currentVoiceKey={
            activeScript?.content.voiceAssignments?.[castingCharacter]
              ?.voiceKey || "jasper"
          }
          initialTestPhrase={castingInitialPhrase}
          onSelectVoice={(chosenKey, chosenRate) => {
            handleAssignVoice(
              castingCharacter,
              chosenKey,
              chosenRate ??
                activeScript?.content.voiceAssignments?.[castingCharacter]
                  ?.speechRate ??
                1.0,
            );
          }}
        />
      )}
    </div>
  );
}
