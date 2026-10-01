"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CreativeSurface, Eyebrow } from "@/components/ui/creative";
import { Icon } from "@/components/ui/icon";

interface SceneBlock {
  id: string;
  type: "slugline" | "action" | "dialogue";
  character?: string;
  parenthetical?: string;
  text: string;
}

interface ScriptDocument {
  id: string;
  title: string;
  logline?: string | null;
  targetDurationSeconds?: number | null;
  content: {
    scenes: SceneBlock[];
  };
  createdAt: string;
  updatedAt: string;
}

const VOICES = [
  { key: "ar-om-salim", name: "Salim (Omani Arabic, Warm)" },
  { key: "ar-om-shatha", name: "Shatha (Omani Arabic, Natural)" },
  { key: "en-us-alex", name: "Alex (English, Conversational)" },
  { key: "en-us-emma", name: "Emma (English, Expressive)" },
];

export function ScriptwritingStudio({
  organizationId,
  canGenerate,
}: {
  organizationSlug?: string;
  organizationId: string;
  canGenerate: boolean;
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

  // Voice synthesis modal/state
  const [synthesizingBlockId, setSynthesizingBlockId] = useState<string | null>(
    null,
  );
  const [selectedVoice, setSelectedVoice] = useState<string>("ar-om-salim");
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);

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
          }),
        },
      );
      if (res.ok) {
        setStatusMessage("Script saved successfully.");
        setTimeout(() => setStatusMessage(null), 3000);
      }
    } catch {
      setStatusMessage("Failed to save script.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleAddBlock(type: "slugline" | "action" | "dialogue") {
    if (!activeScript) return;
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
    setActiveScript({
      ...activeScript,
      content: {
        scenes: activeScript.content.scenes.filter((s) => s.id !== id),
      },
    });
  }

  async function handleAiGenerate() {
    if (!activeScript || !aiPrompt.trim() || isGenerating) return;
    setIsGenerating(true);
    setStatusMessage(null);

    try {
      const currentContext = activeScript.content.scenes
        .map((b) =>
          b.type === "dialogue" ? `${b.character}: ${b.text}` : b.text,
        )
        .join("\n");

      const res = await fetch(
        `/api/scripts/${encodeURIComponent(activeScript.id)}/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: aiPrompt,
            action: aiAction,
            currentScene: currentContext.slice(-1500),
          }),
        },
      );

      if (!res.ok) {
        throw new Error("Screenplay generation failed.");
      }

      const data = await res.json();
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

  async function handleSynthesizeDialogue(block: SceneBlock) {
    if (!activeScript || !block.text.trim()) return;
    setVoiceNotice("Synthesizing audio via BytePlus Seed Speech TTS 2.0...");

    try {
      const res = await fetch(
        `/api/scripts/${encodeURIComponent(activeScript.id)}/synthesize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: block.text,
            voiceKey: selectedVoice,
          }),
        },
      );

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || "Voice synthesis failed.");
      }

      const data = await res.json();
      setVoiceNotice(
        `Speech generation queued! Job ID: ${data.jobId.slice(0, 8)}... (Track in Speech Studio or Activity Center)`,
      );
      setTimeout(() => setVoiceNotice(null), 6000);
      setSynthesizingBlockId(null);
    } catch (err) {
      setVoiceNotice(err instanceof Error ? err.message : "Synthesis failed.");
    }
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
                  onClick={() => setActiveScript(s)}
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

        {/* Center: Screenplay Page Editor */}
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

              {/* Screenplay Content Canvas */}
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
                          handleUpdateBlock(block.id, { text: e.target.value })
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
                          handleUpdateBlock(block.id, { text: e.target.value })
                        }
                        className="w-full resize-none bg-transparent leading-relaxed text-foreground/90 focus:outline-none"
                      />
                    )}

                    {/* Dialogue Line */}
                    {block.type === "dialogue" && (
                      <div className="mx-auto max-w-md space-y-1 text-center">
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
                          className="w-full resize-none bg-transparent text-center leading-relaxed text-foreground focus:outline-none"
                        />

                        {/* Synthesize Button right on dialogue */}
                        <div className="pt-1">
                          <button
                            onClick={() => setSynthesizingBlockId(block.id)}
                            className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold text-primary transition hover:bg-primary/20"
                          >
                            <Icon name="voice" className="size-3" />
                            Synthesize Line (TTS 2.0)
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Block Action Controls */}
                    <div className="absolute top-2 right-2 hidden gap-1 opacity-80 group-hover:flex">
                      <button
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
              Powered by BytePlus Seed 2.0 text model.
            </p>

            <div className="mt-4 space-y-3">
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
                disabled={!aiPrompt.trim() || isGenerating || !canGenerate}
              >
                {isGenerating ? "Generating Line..." : "Generate with Seed LLM"}
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
                      {VOICES.map((v) => (
                        <option key={v.key} value={v.key}>
                          {v.name}
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
    </div>
  );
}
