"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Annotation, CreativeSurface, Eyebrow } from "@/components/ui/creative";
import { Icon } from "@/components/ui/icon";
import { StatusBadge } from "@/components/admin/primitives";
import { AudioWaveformPlayer } from "@/components/ui/audio-waveform-player";
import { VoiceCastingBooth } from "@/components/ui/voice-casting-booth";

interface Persona {
  id: string;
  name: string;
  avatarUrl: string | null;
  tag: string | null;
  description: string | null;
  systemPrompt: string;
  voiceKey: string | null;
  modelId: string;
  isPreset: boolean;
}

interface ChatThread {
  id: string;
  title: string;
  modelId: string;
  persona?: Persona | null;
  createdAt: string;
  updatedAt: string;
  _count?: { messages: number };
}

interface ChatMessage {
  id: string;
  role: string;
  content: string;
  tokensUsed: number | null;
  createdAt: string;
  audioJobId?: string | null;
  audioAssetId?: string | null;
  metadata?: {
    chargedCredits?: number;
    generationJobId?: string;
    audioJobId?: string;
    voiceKey?: string;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  } | null;
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

const SEED_TEXT_MODELS = [
  {
    id: "doubao-seed-character-260628",
    name: "Doubao Seed Character",
    badge: "Roleplay & Character",
  },
  {
    id: "dola-seed-2-1-turbo-260628",
    name: "Dola Seed 2.1 Turbo",
    badge: "Flagship Fast",
  },
  { id: "seed-2-0-pro-260328", name: "Seed 2.0 Pro", badge: "Deep Reasoning" },
  { id: "seed-2-0-lite-260428", name: "Seed 2.0 Lite", badge: "Efficient" },
  {
    id: "seed-2-0-mini-260428",
    name: "Seed 2.0 Mini",
    badge: "Ultra Lightweight",
  },
  {
    id: "seed-2-0-code-preview-260328",
    name: "Seed 2.0 Code",
    badge: "Technical Preview",
  },
  { id: "seed-1-8-251228", name: "Seed 1.8 Standard", badge: "Long Context" },
  { id: "seed-1-6-250915", name: "Seed 1.6 Standard", badge: "Stable" },
  { id: "seed-1-6-flash-250715", name: "Seed 1.6 Flash", badge: "Low Latency" },
];

export function CharacterChatWorkspace({
  organizationId,
  canGenerate,
}: {
  organizationSlug: string;
  organizationId: string;
  canGenerate: boolean;
}) {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(
    "doubao-seed-character-260628",
  );
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCreatingPersona, setIsCreatingPersona] = useState(false);

  // Auto-voice & speech synthesis state
  const [autoVoice, setAutoVoice] = useState(false);
  const [synthesizingMsgId, setSynthesizingMsgId] = useState<string | null>(
    null,
  );

  // New Persona form state
  const [newPersonaName, setNewPersonaName] = useState("");
  const [newPersonaTag, setNewPersonaTag] = useState("");
  const [newPersonaDesc, setNewPersonaDesc] = useState("");
  const [newPersonaPrompt, setNewPersonaPrompt] = useState("");
  const [newPersonaVoiceKey, setNewPersonaVoiceKey] = useState("jasper");

  // Voice Casting Booth state
  const [castingBoothOpen, setCastingBoothOpen] = useState(false);

  // Dictation & Voice Call mode state
  const [isListening, setIsListening] = useState(false);
  const [isCallModeActive, setIsCallModeActive] = useState(false);
  const recognitionRef = useRef<{ stop: () => void; start: () => void } | null>(
    null,
  );

  function toggleSpeechRecognition() {
    if (typeof window === "undefined") return;
    const windowWithSpeech = window as unknown as {
      SpeechRecognition?: new () => {
        continuous: boolean;
        interimResults: boolean;
        lang: string;
        onresult: (e: {
          resultIndex: number;
          results: Array<{ 0: { transcript: string } }>;
        }) => void;
        onerror: () => void;
        onend: () => void;
        start: () => void;
        stop: () => void;
      };
      webkitSpeechRecognition?: new () => {
        continuous: boolean;
        interimResults: boolean;
        lang: string;
        onresult: (e: {
          resultIndex: number;
          results: Array<{ 0: { transcript: string } }>;
        }) => void;
        onerror: () => void;
        onend: () => void;
        start: () => void;
        stop: () => void;
      };
    };

    const SpeechRecognition =
      windowWithSpeech.SpeechRecognition ||
      windowWithSpeech.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setErrorMessage(
        "Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.",
      );
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event) => {
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const item = event.results[i];
          if (item?.[0]?.transcript) {
            transcript += item[0].transcript;
          }
        }
        if (transcript.trim()) {
          setInputText((prev) =>
            prev ? `${prev} ${transcript.trim()}` : transcript.trim(),
          );
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
      recognitionRef.current = recognition;
      setIsListening(true);
    } catch {
      setIsListening(false);
    }
  }

  // Load personas and threads on mount
  useEffect(() => {
    async function loadData() {
      try {
        const [personasRes, threadsRes] = await Promise.all([
          fetch(
            `/api/personas?organizationId=${encodeURIComponent(organizationId)}`,
          ),
          fetch(
            `/api/chat/threads?organizationId=${encodeURIComponent(organizationId)}`,
          ),
        ]);

        if (personasRes.ok) {
          const data = await personasRes.json();
          setPersonas(data.personas || []);
          if (data.personas?.length) {
            setSelectedPersona(data.personas[0]);
          }
        }

        if (threadsRes.ok) {
          const data = await threadsRes.json();
          setThreads(data.threads || []);
          if (data.threads?.length) {
            setActiveThreadId(data.threads[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to load chat data", err);
      }
    }
    loadData();
  }, [organizationId]);

  // Load thread messages when activeThreadId changes
  useEffect(() => {
    if (!activeThreadId) return;
    let ignore = false;
    async function loadMessages() {
      try {
        const res = await fetch(
          `/api/chat/threads/${encodeURIComponent(activeThreadId!)}`,
        );
        if (res.ok) {
          const data = await res.json();
          if (!ignore) {
            setMessages(data.thread?.messages || []);
            if (data.thread?.persona) {
              setSelectedPersona(data.thread.persona);
            }
            if (data.thread?.modelId) {
              setSelectedModel(data.thread.modelId);
            }
          }
        }
      } catch (err) {
        console.error("Failed to load thread messages", err);
      }
    }
    loadMessages();
    return () => {
      ignore = true;
    };
  }, [activeThreadId]);

  async function handleStartNewThread(persona?: Persona) {
    const targetPersona = persona || selectedPersona;
    const modelToUse = targetPersona?.modelId || selectedModel;
    try {
      const res = await fetch("/api/chat/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          personaId: targetPersona?.id || null,
          title: targetPersona
            ? `Chat with ${targetPersona.name}`
            : "New Conversation",
          modelId: modelToUse,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setThreads((prev) => [data.thread, ...prev]);
        setActiveThreadId(data.thread.id);
        if (targetPersona) setSelectedPersona(targetPersona);
        setSelectedModel(modelToUse);
        setMessages([]);
      }
    } catch (err) {
      console.error("Failed to create thread", err);
    }
  }

  async function handleSendMessage(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!inputText.trim() || isSending) return;

    setErrorMessage(null);
    let threadId = activeThreadId;

    // Create a thread if none is active
    if (!threadId) {
      const targetPersona = selectedPersona;
      const modelToUse = targetPersona?.modelId || selectedModel;
      const res = await fetch("/api/chat/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          personaId: targetPersona?.id || null,
          title: inputText.slice(0, 36) + (inputText.length > 36 ? "..." : ""),
          modelId: modelToUse,
        }),
      });
      if (!res.ok) {
        setErrorMessage("Could not initialize chat thread.");
        return;
      }
      const data = await res.json();
      threadId = data.thread.id;
      setThreads((prev) => [data.thread, ...prev]);
      setActiveThreadId(threadId);
    }

    const userText = inputText.trim();
    const clientRequestId = crypto.randomUUID();
    setInputText("");
    setIsSending(true);

    // Optimistic user message
    const tempUserMsg: ChatMessage = {
      id: `temp-${messages.length + 1}`,
      role: "user",
      content: userText,
      tokensUsed: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await fetch(
        `/api/chat/threads/${encodeURIComponent(threadId!)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: userText,
            idempotencyKey: clientRequestId,
            autoVoice,
          }),
        },
      );

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || "Generation request failed");
      }

      const data = await res.json();
      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== tempUserMsg.id);
        return [...filtered, data.userMessage, data.message];
      });

      if (data.audioJobId && threadId) {
        pollVoiceJob(threadId);
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Failed to receive character response.",
      );
    } finally {
      setIsSending(false);
    }
  }

  const pollVoiceJob = useCallback((targetThreadId: string) => {
    let count = 0;
    const interval = setInterval(async () => {
      count++;
      if (count > 25) {
        clearInterval(interval);
        return;
      }
      try {
        const res = await fetch(
          `/api/chat/threads/${encodeURIComponent(targetThreadId)}`,
        );
        if (res.ok) {
          const data = await res.json();
          if (data.thread?.messages) {
            setMessages(data.thread.messages);
            const anyPending = data.thread.messages.some(
              (m: ChatMessage) => m.audioJobId && !m.audioAssetId,
            );
            if (!anyPending) {
              clearInterval(interval);
            }
          }
        }
      } catch {
        clearInterval(interval);
      }
    }, 2000);
  }, []);

  async function handleSynthesizeMessage(message: ChatMessage) {
    if (!activeThreadId || synthesizingMsgId) return;
    setSynthesizingMsgId(message.id);
    try {
      const res = await fetch(
        `/api/chat/threads/${encodeURIComponent(activeThreadId)}/messages/${encodeURIComponent(message.id)}/synthesize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            voiceKey: selectedPersona?.voiceKey || "jasper",
          }),
        },
      );
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || "Voice synthesis failed");
      }
      const data = await res.json();
      setMessages((prev) =>
        prev.map((m) =>
          m.id === message.id ? { ...m, audioJobId: data.jobId } : m,
        ),
      );
      pollVoiceJob(activeThreadId);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Voice synthesis failed.",
      );
    } finally {
      setSynthesizingMsgId(null);
    }
  }

  async function handleCreatePersonaSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newPersonaName.trim() || !newPersonaPrompt.trim()) return;

    try {
      const res = await fetch("/api/personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          name: newPersonaName.trim(),
          tag: newPersonaTag.trim() || undefined,
          description: newPersonaDesc.trim() || undefined,
          systemPrompt: newPersonaPrompt.trim(),
          voiceKey: newPersonaVoiceKey,
          modelId: selectedModel,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setPersonas((prev) => [...prev, data.persona]);
        setSelectedPersona(data.persona);
        setIsCreatingPersona(false);
        setNewPersonaName("");
        setNewPersonaTag("");
        setNewPersonaDesc("");
        setNewPersonaPrompt("");
        setNewPersonaVoiceKey("jasper");
      }
    } catch (err) {
      console.error("Failed to create persona", err);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-65px)] max-w-[1600px] flex-col p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Eyebrow>BytePlus Seed Text Studio</Eyebrow>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold text-primary">
              All 9 Models Ready
            </span>
          </div>
          <h1 className="font-display mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Character Chat
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Multi-turn persona dialogues powered by Doubao Seed character & Ark
            LLM text models.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Model Selector */}
          <div className="relative">
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="h-10 rounded-xl border border-border bg-card px-3 pr-8 text-xs font-semibold text-foreground shadow-xs transition hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {SEED_TEXT_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.badge})
                </option>
              ))}
            </select>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsCreatingPersona(true)}
            className="gap-1.5"
          >
            <Icon name="plus" className="size-3.5" />
            New Persona
          </Button>

          <button
            type="button"
            onClick={() => setAutoVoice(!autoVoice)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
              autoVoice
                ? "border-primary/50 bg-primary/10 text-primary shadow-xs"
                : "border-border bg-card text-muted-foreground hover:border-border/80 hover:text-foreground"
            }`}
            title="Automatically synthesize speech audio for each character response via Seed Speech TTS 2.0"
          >
            <Icon name="voice" className="size-3.5" />
            <span>Auto-Voice {autoVoice ? "ON" : "OFF"}</span>
          </button>

          <Button
            size="sm"
            onClick={() => handleStartNewThread()}
            className="gap-1.5"
          >
            <Icon name="chat" className="size-3.5" />
            New Chat
          </Button>
        </div>
      </div>

      {/* Main Grid: Sidebar (Personas & Threads) + Chat Timeline */}
      <div className="mt-4 grid min-h-0 flex-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* Left Sidebar */}
        <div className="flex flex-col gap-4 overflow-hidden rounded-2xl border border-border bg-card/60 p-3">
          {/* Personas Carousel / List */}
          <div>
            <div className="flex items-center justify-between px-1 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Personas
              </span>
              <Annotation className="text-sm text-primary">
                pick a voice
              </Annotation>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {personas.map((persona) => {
                const isSelected = selectedPersona?.id === persona.id;
                return (
                  <button
                    key={persona.id}
                    onClick={() => {
                      setSelectedPersona(persona);
                      handleStartNewThread(persona);
                    }}
                    className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-left transition ${
                      isSelected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-surface-sunken text-foreground hover:border-border/80"
                    }`}
                  >
                    <div className="grid size-7 place-items-center rounded-lg bg-primary/20 text-xs font-bold text-primary">
                      {persona.name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-xs font-semibold">
                        {persona.name}
                      </div>
                      {persona.tag && (
                        <div className="text-[10px] text-muted-foreground">
                          {persona.tag}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-border pt-3">
            <span className="px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Conversations
            </span>
          </div>

          {/* Threads List */}
          <div className="flex-1 space-y-1.5 overflow-y-auto pr-1">
            {threads.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                No conversations yet. Say hello below!
              </p>
            ) : (
              threads.map((thread) => {
                const isActive = activeThreadId === thread.id;
                return (
                  <button
                    key={thread.id}
                    onClick={() => setActiveThreadId(thread.id)}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs transition ${
                      isActive
                        ? "bg-primary/10 font-semibold text-primary"
                        : "text-muted-foreground hover:bg-surface-sunken hover:text-foreground"
                    }`}
                  >
                    <span className="truncate">{thread.title}</span>
                    <span className="text-[10px] opacity-70">
                      {thread._count?.messages ?? 0} msgs
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Chat View */}
        <CreativeSurface className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Active Persona Banner */}
          {selectedPersona && (
            <div className="flex items-center justify-between border-b border-border bg-surface-sunken/60 px-5 py-3">
              <div className="flex items-center gap-3">
                <div className="grid size-9 place-items-center rounded-xl bg-primary/15 font-display text-sm font-bold text-primary">
                  {selectedPersona.name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">
                    {selectedPersona.name}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {selectedPersona.description ||
                      "Doubao Character Intelligence"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedPersona.voiceKey && (
                  <span className="flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    <Icon name="voice" className="size-3" />
                    <span>
                      {VERIFIED_VOICES.find(
                        (v) => v.key === selectedPersona.voiceKey,
                      )?.name || selectedPersona.voiceKey}
                    </span>
                  </span>
                )}
                <span className="rounded-md border border-border bg-card px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {SEED_TEXT_MODELS.find((m) => m.id === selectedModel)?.name ||
                    selectedModel}
                </span>

                <button
                  type="button"
                  onClick={() => setIsCallModeActive(true)}
                  title="Start Talking Persona Voice Call"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary transition hover:bg-primary/20"
                >
                  <Icon name="voice" className="size-3.5" />
                  <span>Voice Call</span>
                </button>
              </div>
            </div>
          )}

          {/* Messages Timeline */}
          <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
            {messages.length === 0 ? (
              <div className="grid h-full place-items-center text-center">
                <div className="max-w-md">
                  <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                    <Icon name="chat" className="size-6" />
                  </span>
                  <h4 className="font-display mt-3 text-lg font-semibold text-foreground">
                    Chat with {selectedPersona?.name || "AI Companion"}
                  </h4>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {selectedPersona?.description ||
                      "Send a message below to start exploring ideas, writing dialogues, or roleplaying scenarios."}
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {[
                      "Tell me an intriguing story starter",
                      "How can we craft a cinematic scene in Oman?",
                      "Give me a witty dialogue for two rivals",
                    ].map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => {
                          setInputText(suggestion);
                        }}
                        className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                      >
                        {suggestion} →
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              messages.map((msg) => {
                const isUser = msg.role === "user";
                return (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    {!isUser && (
                      <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-xs font-bold text-primary">
                        {selectedPersona?.name.charAt(0) || "AI"}
                      </div>
                    )}
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        isUser
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "border border-border bg-card text-foreground"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      {msg.tokensUsed ? (
                        <div
                          className={`mt-2 flex items-center gap-2 text-[10px] ${
                            isUser
                              ? "text-primary-foreground/75"
                              : "text-muted-foreground"
                          }`}
                        >
                          <span>{msg.tokensUsed} tokens</span>
                          {msg.metadata?.chargedCredits !== undefined && (
                            <span>· {msg.metadata.chargedCredits} credits</span>
                          )}
                        </div>
                      ) : null}

                      {/* Voiced reply audio player or synthesis trigger */}
                      {!isUser && (
                        <>
                          {msg.audioAssetId ? (
                            <AudioWaveformPlayer
                              src={`/api/assets/${msg.audioAssetId}`}
                              speakerName={selectedPersona?.name || "Persona"}
                              voiceName="Seed TTS 2.0"
                              className="mt-2.5 max-w-lg"
                            />
                          ) : msg.audioJobId || synthesizingMsgId === msg.id ? (
                            <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
                              <span className="size-2 animate-ping rounded-full bg-primary" />
                              <span className="text-[11px] font-medium">
                                Synthesizing voice reply (Seed TTS 2.0)...
                              </span>
                            </div>
                          ) : canGenerate ? (
                            <div className="mt-2.5 flex items-center justify-between border-t border-border/50 pt-2">
                              <button
                                type="button"
                                onClick={() => handleSynthesizeMessage(msg)}
                                disabled={
                                  isSending || Boolean(synthesizingMsgId)
                                }
                                className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary transition hover:border-primary/60 hover:bg-primary/20"
                              >
                                <Icon name="voice" className="size-3" />
                                <span>Voice Reply (TTS 2.0)</span>
                              </button>
                              <span className="text-[10px] text-muted-foreground">
                                Voice:{" "}
                                {selectedPersona?.voiceKey
                                  ? VERIFIED_VOICES.find(
                                      (v) => v.key === selectedPersona.voiceKey,
                                    )?.name || selectedPersona.voiceKey
                                  : "Jasper"}
                              </span>
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {isSending && (
              <div className="flex items-center gap-3">
                <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-xs font-bold text-primary">
                  {selectedPersona?.name.charAt(0) || "AI"}
                </div>
                <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
                  <span className="size-2 animate-ping rounded-full bg-primary" />
                  Generating response via{" "}
                  {SEED_TEXT_MODELS.find((m) => m.id === selectedModel)?.name}
                  ...
                </div>
              </div>
            )}
          </div>

          {/* Error notice */}
          {errorMessage && (
            <div className="mx-4 mb-2 rounded-xl border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
              {errorMessage}
            </div>
          )}

          {/* Composer */}
          <form
            onSubmit={handleSendMessage}
            className="border-t border-border bg-surface-sunken/40 p-3 sm:p-4"
          >
            <div className="relative flex items-center">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                disabled={!canGenerate || isSending}
                rows={2}
                placeholder={
                  canGenerate
                    ? `Message ${selectedPersona?.name || "companion"}... (Press Enter to send)`
                    : "No permission to generate."
                }
                className="w-full resize-none rounded-xl border border-border bg-card p-3 pr-24 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="absolute right-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleSpeechRecognition}
                  title={
                    isListening
                      ? "Listening... Click to stop"
                      : "Voice Dictation (Speech-to-Text)"
                  }
                  className={`grid size-8 place-items-center rounded-lg transition ${
                    isListening
                      ? "bg-destructive text-destructive-foreground animate-pulse"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon name="voice" className="size-4" />
                </button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!inputText.trim() || isSending || !canGenerate}
                  className="rounded-lg px-4"
                >
                  Send
                </Button>
              </div>
            </div>
          </form>
        </CreativeSurface>
      </div>

      {/* New Persona Modal */}
      {isCreatingPersona && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl">
            <h3 className="font-display text-xl font-bold text-foreground">
              Create New Persona
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Define a custom personality, tone, and system prompt for
              interactive character chat.
            </p>

            <form
              onSubmit={handleCreatePersonaSubmit}
              className="mt-4 space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-foreground">
                  Persona Name *
                </label>
                <input
                  type="text"
                  required
                  value={newPersonaName}
                  onChange={(e) => setNewPersonaName(e.target.value)}
                  placeholder="e.g. Captain Tariq"
                  className="mt-1 w-full rounded-xl border border-border bg-surface-sunken p-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground">
                  Tag / Role
                </label>
                <input
                  type="text"
                  value={newPersonaTag}
                  onChange={(e) => setNewPersonaTag(e.target.value)}
                  placeholder="e.g. Dhow Navigator & Historian"
                  className="mt-1 w-full rounded-xl border border-border bg-surface-sunken p-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground">
                  Short Description
                </label>
                <input
                  type="text"
                  value={newPersonaDesc}
                  onChange={(e) => setNewPersonaDesc(e.target.value)}
                  placeholder="e.g. Wise seafarer with deep knowledge of frankincense trade routes."
                  className="mt-1 w-full rounded-xl border border-border bg-surface-sunken p-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-foreground">
                    Seed Speech Voice (TTS 2.0) *
                  </label>
                  <button
                    type="button"
                    onClick={() => setCastingBoothOpen(true)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                  >
                    <Icon name="voice" className="size-3" />
                    <span>Audition in Booth →</span>
                  </button>
                </div>
                <select
                  value={newPersonaVoiceKey}
                  onChange={(e) => setNewPersonaVoiceKey(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-surface-sunken p-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {VERIFIED_VOICES.map((v) => (
                    <option key={v.key} value={v.key}>
                      {v.name} ({v.lang} • {v.style})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Voice used when generating speech replies via Seed Speech TTS
                  2.0.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground">
                  System Prompt (Personality & Rules) *
                </label>
                <textarea
                  required
                  rows={4}
                  value={newPersonaPrompt}
                  onChange={(e) => setNewPersonaPrompt(e.target.value)}
                  placeholder="You are Captain Tariq, an experienced Omani dhow navigator..."
                  className="mt-1 w-full rounded-xl border border-border bg-surface-sunken p-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsCreatingPersona(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">Create Persona</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Talking Persona Call Mode Modal */}
      {isCallModeActive && selectedPersona && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4 backdrop-blur-lg"
          role="dialog"
          aria-modal="true"
          aria-label="Talking Persona Call"
        >
          <div className="relative flex w-full max-w-lg flex-col items-center rounded-3xl border border-border bg-card p-8 shadow-2xl text-center">
            <div className="mb-4 flex items-center gap-2">
              <StatusBadge tone="success">Live Persona Call</StatusBadge>
              <span className="font-mono text-xs text-muted-foreground">
                Seed TTS 2.0
              </span>
            </div>

            {/* Animated Sketch Audio Waveform Ring Avatar */}
            <div className="relative my-4">
              <div className="absolute inset-0 -m-4 animate-ping rounded-full bg-primary/10 opacity-75" />
              <div className="absolute inset-0 -m-8 animate-pulse rounded-full border border-primary/20" />

              <div className="relative grid size-28 place-items-center rounded-full border-2 border-primary/40 bg-primary/15 font-display text-3xl font-bold text-primary shadow-lg">
                {selectedPersona.name.charAt(0)}
              </div>
            </div>

            <h3 className="font-display mt-2 text-2xl font-bold text-foreground">
              {selectedPersona.name}
            </h3>
            <p className="text-xs text-muted-foreground">
              {selectedPersona.tag ||
                selectedPersona.description ||
                "AI Companion"}
            </p>

            {/* Status indicator */}
            <div className="mt-4 flex items-center gap-2 rounded-full border border-border bg-surface-sunken px-3.5 py-1 text-xs">
              <span className="size-2 animate-pulse rounded-full bg-success" />
              <span className="font-medium text-muted-foreground">
                {isSending
                  ? "Persona speaking..."
                  : isListening
                    ? "Listening to you..."
                    : "Connected"}
              </span>
            </div>

            {/* Latest Message Transcript */}
            <div className="mt-6 w-full rounded-2xl border border-border/60 bg-surface-sunken/40 p-4 text-left">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Recent Exchange
              </span>
              <p className="mt-1 text-xs italic leading-relaxed text-foreground/90">
                {messages.slice(-1)[0]?.content ||
                  `Say hello to start speaking with ${selectedPersona.name}`}
              </p>

              {messages.slice(-1)[0]?.audioAssetId && (
                <div className="mt-3">
                  <AudioWaveformPlayer
                    src={`/api/assets/${messages.slice(-1)[0]!.audioAssetId}`}
                    speakerName={selectedPersona.name}
                    voiceName="Seed TTS 2.0"
                    autoPlay
                  />
                </div>
              )}
            </div>

            {/* Call Actions */}
            <div className="mt-8 flex items-center gap-4">
              <button
                type="button"
                onClick={toggleSpeechRecognition}
                title={isListening ? "Mute Microphone" : "Unmute Microphone"}
                className={`grid size-12 place-items-center rounded-full shadow-md transition ${
                  isListening
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon name="voice" className="size-5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsCallModeActive(false);
                  if (isListening) toggleSpeechRecognition();
                }}
                className="inline-flex items-center gap-2 rounded-full bg-destructive px-6 py-3 text-xs font-bold text-destructive-foreground shadow-md transition hover:bg-destructive/90"
              >
                <span>End Call</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Voice Casting Booth Modal */}
      {castingBoothOpen && (
        <VoiceCastingBooth
          isOpen={castingBoothOpen}
          onClose={() => setCastingBoothOpen(false)}
          organizationId={organizationId}
          characterName={newPersonaName || "New Persona"}
          currentVoiceKey={newPersonaVoiceKey}
          initialTestPhrase={
            newPersonaPrompt.slice(0, 140) ||
            "Hello! I am ready to step into character and speak with you."
          }
          onSelectVoice={(chosenKey) => setNewPersonaVoiceKey(chosenKey)}
        />
      )}
    </div>
  );
}
