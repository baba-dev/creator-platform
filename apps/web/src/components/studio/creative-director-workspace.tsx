"use client";

import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CreativeSurface, Eyebrow } from "@/components/ui/creative";
import { Icon } from "@/components/ui/icon";
import {
  StudioModelSelect,
  type StudioModelOption,
} from "@/components/studio/studio-model-select";
import { runQuotedTextFeature } from "@/lib/text-feature-client";

interface DirectorMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  chargedCredits?: number;
  tokensUsed?: number;
}

export function CreativeDirectorWorkspace({
  organizationSlug,
  organizationId,
  canGenerate,
  defaultModelId,
  textModels,
}: {
  organizationSlug: string;
  organizationId: string;
  canGenerate: boolean;
  defaultModelId: string | null;
  textModels: StudioModelOption[];
}) {
  const [messages, setMessages] = useState<DirectorMessage[]>([
    {
      id: "initial-welcome",
      role: "assistant",
      content:
        "Welcome to the Creative Director desk. I help you shape high-impact creative campaigns, visual aesthetics, cinematic camera movements, and evocative voiceover scripts.\n\nTell me what you want to produce, or choose a starting brief below.",
    },
  ]);
  const [selectedModel, setSelectedModel] = useState<string>(
    defaultModelId ?? textModels[0]?.id ?? "",
  );
  const [inputPrompt, setInputPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  // Extract prompt directives from assistant output
  function parseActionCards(content: string) {
    const cards: Array<{
      type: "image" | "video" | "voice";
      title: string;
      text: string;
      link: string;
    }> = [];

    const imageMatch = content.match(
      /\[IMAGE PROMPT\]\s*([\s\S]*?)(?=\[(?:VIDEO PROMPT|VOICE SCRIPT)\]|$)/i,
    );
    if (imageMatch && imageMatch[1]?.trim()) {
      const text = imageMatch[1].trim();
      cards.push({
        type: "image",
        title: "Image Concept",
        text,
        link: `/app/${organizationSlug}/image?prompt=${encodeURIComponent(text.slice(0, 500))}`,
      });
    }

    const videoMatch = content.match(
      /\[VIDEO PROMPT\]\s*([\s\S]*?)(?=\[(?:IMAGE PROMPT|VOICE SCRIPT)\]|$)/i,
    );
    if (videoMatch && videoMatch[1]?.trim()) {
      const text = videoMatch[1].trim();
      cards.push({
        type: "video",
        title: "Video Shot Sequence",
        text,
        link: `/app/${organizationSlug}/video?prompt=${encodeURIComponent(text.slice(0, 500))}`,
      });
    }

    const voiceMatch = content.match(
      /\[VOICE SCRIPT\]\s*([\s\S]*?)(?=\[(?:IMAGE PROMPT|VIDEO PROMPT)\]|$)/i,
    );
    if (voiceMatch && voiceMatch[1]?.trim()) {
      const text = voiceMatch[1].trim();
      cards.push({
        type: "voice",
        title: "Voice Script & Narration",
        text,
        link: `/app/${organizationSlug}/speech?text=${encodeURIComponent(text.slice(0, 500))}`,
      });
    }

    return cards;
  }

  async function handleSend(promptText?: string) {
    const textToSend = promptText || inputPrompt;
    if (!textToSend.trim() || isGenerating || !selectedModel) return;

    setErrorNotice(null);
    setInputPrompt("");
    setIsGenerating(true);

    const userMsg: DirectorMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: textToSend.trim(),
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);

    try {
      const data = await runQuotedTextFeature<{
        content: string;
        chargedCredits?: number;
        usage?: { totalTokens?: number };
      }>("/api/director/chat", {
        organizationId,
        modelId: selectedModel,
        messages: nextMessages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      });
      const assistantMsg: DirectorMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.content,
        chargedCredits: data.chargedCredits,
        tokensUsed: data.usage?.totalTokens,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setErrorNotice(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-65px)] max-w-[1600px] flex-col p-4 sm:p-6 lg:p-8">
      {/* Studio Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Eyebrow>Creative Direction & Dispatch</Eyebrow>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold text-primary">
              Multi-Studio Bridge
            </span>
          </div>
          <h1 className="font-display mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Creative Director
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Brainstorm campaigns, refine aesthetic prompts, and dispatch
            directly to Image, Video, and Speech studios.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <StudioModelSelect
            models={textModels}
            value={selectedModel}
            onChange={(value) => {
              setSelectedModel(value);
              setErrorNotice(null);
            }}
            ariaLabel="Creative Director model"
          />

          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setMessages([
                {
                  id: "initial-welcome",
                  role: "assistant",
                  content:
                    "Creative session reset. What new campaign or concept would you like to direct?",
                },
              ]);
            }}
          >
            Reset Session
          </Button>
        </div>
      </div>

      {/* Main Director Workspace */}
      <div className="mt-4 grid min-h-0 flex-1 gap-6 lg:grid-cols-[1fr_360px]">
        {/* Left: Interactive Director Conversation */}
        <CreativeSurface className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
            {messages.map((msg) => {
              const isUser = msg.role === "user";
              const actionCards = !isUser ? parseActionCards(msg.content) : [];

              return (
                <div
                  key={msg.id}
                  className={`flex gap-3.5 ${isUser ? "justify-end" : "justify-start"}`}
                >
                  {!isUser && (
                    <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
                      <Icon name="director" className="size-5" />
                    </div>
                  )}

                  <div className={`max-w-[88%] space-y-3`}>
                    <div
                      className={`rounded-2xl px-5 py-4 text-sm leading-relaxed ${
                        isUser
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "border border-border bg-card text-foreground"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>

                      {msg.tokensUsed ? (
                        <div className="mt-3 flex items-center gap-2 border-t border-border/40 pt-2 text-[10px] text-muted-foreground">
                          <span>{msg.tokensUsed} tokens</span>
                          {msg.chargedCredits !== undefined && (
                            <span>· {msg.chargedCredits} credits charged</span>
                          )}
                        </div>
                      ) : null}
                    </div>

                    {/* Render Action Dispatch Cards if detected */}
                    {actionCards.length > 0 && (
                      <div className="space-y-2 pt-1">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-primary">
                          Production Dispatch Cards
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {actionCards.map((card, idx) => (
                            <div
                              key={idx}
                              className="rounded-xl border border-primary/30 bg-primary/[0.03] p-3 transition hover:border-primary/60"
                            >
                              <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                                <Icon
                                  name={
                                    card.type === "voice" ? "voice" : card.type
                                  }
                                  className="size-3.5 text-primary"
                                />
                                {card.title}
                              </div>
                              <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                                {card.text}
                              </p>
                              <Button
                                asChild
                                variant="secondary"
                                size="sm"
                                className="mt-3 w-full justify-center text-xs font-semibold text-primary"
                              >
                                <Link href={card.link as Route}>
                                  Open in{" "}
                                  {card.type === "voice"
                                    ? "Speech"
                                    : card.type === "video"
                                      ? "Video"
                                      : "Image"}{" "}
                                  Studio →
                                </Link>
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {isGenerating && (
              <div className="flex items-center gap-3">
                <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
                  <Icon name="director" className="size-5" />
                </div>
                <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
                  <span className="size-2 animate-ping rounded-full bg-primary" />
                  Creative Director is drafting your concept & prompt cards...
                </div>
              </div>
            )}
          </div>

          {errorNotice && (
            <div className="mx-4 mb-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              {errorNotice}
            </div>
          )}

          {/* Prompt Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="border-t border-border bg-surface-sunken/40 p-3 sm:p-4"
          >
            <div className="relative flex items-center">
              <textarea
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                disabled={!canGenerate || isGenerating || !selectedModel}
                rows={2}
                placeholder={
                  !canGenerate
                    ? "No permission to generate."
                    : !selectedModel
                      ? "No Creative Director model is currently available."
                      : "Direct your vision: describe a theme, product, video sequence, or mood..."
                }
                className="w-full resize-none rounded-xl border border-border bg-card p-3 pr-24 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="absolute right-3 flex items-center gap-2">
                <Button
                  type="submit"
                  size="sm"
                  disabled={
                    !inputPrompt.trim() ||
                    isGenerating ||
                    !canGenerate ||
                    !selectedModel
                  }
                  className="rounded-lg px-4"
                >
                  Direct
                </Button>
              </div>
            </div>
          </form>
        </CreativeSurface>

        {/* Right: Quick Brief Inspiration Sidebar */}
        <div className="flex flex-col gap-4 overflow-y-auto">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
            <Eyebrow>Director Starters</Eyebrow>
            <h3 className="font-display mt-2 text-base font-bold text-foreground">
              Instant Creative Briefs
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Click any brief below to initiate complete image, video, and audio
              direction.
            </p>

            <div className="mt-4 space-y-2.5">
              {[
                {
                  title: "Omani Luxury Perfume Launch",
                  prompt:
                    "Create a full campaign direction for an ultra-luxury Omani oud perfume called 'Sultanate Mist'. Provide an [IMAGE PROMPT] for the bottle on marble with frankincense smoke, a [VIDEO PROMPT] showing mist drifting across Jebel Akhdar at dusk, and a [VOICE SCRIPT] with regal Arabic/English narration.",
                },
                {
                  title: "Sci-Fi Desert Rover Exploration",
                  prompt:
                    "Direct a sci-fi desert scene set in Wahiba Sands. Provide an [IMAGE PROMPT] of an autonomous rover under twin moons, and a [VIDEO PROMPT] of it navigating glowing sand dunes with dust kicked into the lens.",
                },
                {
                  title: "Artisanal Coffee Roastery",
                  prompt:
                    "Develop a campaign for a boutique Muscat specialty coffee brand. Include an [IMAGE PROMPT] of freshly roasted beans in morning sun, and a [VOICE SCRIPT] welcoming guests to slow morning rituals.",
                },
                {
                  title: "Cinematic Coastal Action",
                  prompt:
                    "Direct an action sequence along the cliffs of Musandam with speedboats cutting through emerald waters. Provide [IMAGE PROMPT] and [VIDEO PROMPT] with dramatic aerial drone framing.",
                },
              ].map((brief, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(brief.prompt)}
                  disabled={isGenerating || !canGenerate || !selectedModel}
                  className="group block w-full rounded-xl border border-border bg-surface-sunken p-3 text-left transition hover:border-primary/50 hover:bg-primary/[0.04]"
                >
                  <div className="text-xs font-semibold text-foreground group-hover:text-primary">
                    {brief.title} →
                  </div>
                  <div className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                    {brief.prompt}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface-sunken p-4 text-xs text-muted-foreground">
            <div className="font-semibold text-foreground">
              One-Click Studio Bridge
            </div>
            <p className="mt-1 leading-relaxed">
              Whenever the Creative Director outputs{" "}
              <code className="text-primary">[IMAGE PROMPT]</code> or{" "}
              <code className="text-primary">[VIDEO PROMPT]</code>, an
              interactive card lets you send the exact parameters to Studio
              without copying and pasting.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
