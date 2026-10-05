"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { runQuotedTextFeature } from "@/lib/text-feature-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
  toolResults?: Array<{
    tool: string;
    input: unknown;
    output: unknown;
    error?: string;
  }>;
  navigationRoute?: string;
  reminderId?: string;
  ticketRef?: string;
}

interface AssistantThread {
  id: string;
  personaId?: string | null;
  modelId?: string | null;
}

interface Reminder {
  id: string;
  message: string;
  remindAt: string;
}

// ---------------------------------------------------------------------------
// Mascot Asset Constants
// ---------------------------------------------------------------------------

const MASCOT_WORKING =
  "/brand/mascots/creators-mascot-working-laptop-queued-laptop-float.svg";
const MASCOT_RUNNING =
  "/brand/mascots/creators-mascot-running-loader-terrain-loop.svg";
const MASCOT_CELEBRATION =
  "/brand/mascots/creators-mascot-success-celebration-motion.svg";
const MASCOT_CONFUSED =
  "/brand/mascots/creators-mascot-confused-long-wait-motion-arranged.svg";

const QUICK_ACTIONS = [
  { label: "💳 My balance", message: "What is my current credit balance?" },
  { label: "🎬 Recent jobs", message: "Show me my recent generation jobs." },
  {
    label: "📁 View assets",
    message: "Show me my recent assets in the library.",
  },
  {
    label: "⏰ Set a reminder",
    message: "Remind me in 10 minutes to review my renders.",
  },
  {
    label: "🛠️ Explain error",
    message: "Why did my generation job fail or time out?",
  },
  {
    label: "🚨 Support ticket",
    message: "I need to open a support ticket for developer help.",
  },
];

// ---------------------------------------------------------------------------
// SVG Icons
// ---------------------------------------------------------------------------

function XIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function SendIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 2 11 13M22 2 15 22l-4-9-9-4 20-7Z" />
    </svg>
  );
}

function MaximizeIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

function MinimizeIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="4 14 10 14 10 20" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="14" y1="10" x2="21" y2="3" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Markdown and Formatted Content Renderer
// ---------------------------------------------------------------------------

function FormattedContent({
  text,
  onNavigate,
}: {
  text: string;
  onNavigate: (route: string) => void;
}) {
  const lines = text.split("\n");

  return (
    <div className="space-y-1.5 leading-relaxed">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={idx} className="h-1.5" />;
        }

        // Callout / Quote (Attention)
        if (trimmed.startsWith("> ")) {
          return (
            <div
              key={idx}
              className="my-1.5 rounded-lg border-l-2 border-primary bg-primary/10 px-3 py-1.5 text-xs text-foreground italic shadow-2xs"
            >
              {renderInline(trimmed.slice(2), onNavigate)}
            </div>
          );
        }

        // Bullet point
        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
          return (
            <div
              key={idx}
              className="flex items-start gap-2 pl-1 text-xs sm:text-sm"
            >
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
              <span>{renderInline(trimmed.slice(2), onNavigate)}</span>
            </div>
          );
        }

        // Numbered list
        const numMatch = /^\d+\.\s+(.*)/.exec(trimmed);
        if (numMatch) {
          return (
            <div
              key={idx}
              className="flex items-start gap-2 pl-1 text-xs sm:text-sm"
            >
              <span className="font-mono text-xs font-semibold text-primary">
                {trimmed.split(".")[0]}.
              </span>
              <span>{renderInline(numMatch[1] ?? "", onNavigate)}</span>
            </div>
          );
        }

        return (
          <p key={idx} className="text-xs sm:text-sm">
            {renderInline(line, onNavigate)}
          </p>
        );
      })}
    </div>
  );
}

function renderInline(text: string, onNavigate: (route: string) => void) {
  // Simple token parser for **bold**, `code`, and [link](url)
  const parts: React.ReactNode[] = [];
  const regex = /(\[.*?\]\(.*?\)|\*\*.*?\*\*|`.*?`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = regex.exec(text);

  while (match !== null) {
    const matchedText = match[0];
    const matchStart = match.index;

    if (matchStart > lastIndex) {
      parts.push(text.substring(lastIndex, matchStart));
    }

    if (matchedText.startsWith("[") && matchedText.includes("](")) {
      const linkMatch = /\[(.*?)\]\((.*?)\)/.exec(matchedText);
      if (linkMatch) {
        const title = linkMatch[1];
        const href = linkMatch[2] ?? "";
        const isInternal = href.startsWith("/");
        parts.push(
          <button
            key={matchStart}
            type="button"
            onClick={() => {
              if (isInternal) {
                onNavigate(href);
              } else {
                window.open(href, "_blank", "noopener,noreferrer");
              }
            }}
            className="inline font-semibold text-primary underline underline-offset-3 hover:text-primary/80 transition-colors cursor-pointer"
          >
            {title}
          </button>,
        );
      }
    } else if (matchedText.startsWith("**") && matchedText.endsWith("**")) {
      parts.push(
        <strong key={matchStart} className="font-bold text-foreground">
          {matchedText.slice(2, -2)}
        </strong>,
      );
    } else if (matchedText.startsWith("`") && matchedText.endsWith("`")) {
      parts.push(
        <code
          key={matchStart}
          className="rounded bg-muted/80 px-1 py-0.5 font-mono text-xs font-medium text-foreground border border-border/50"
        >
          {matchedText.slice(1, -1)}
        </code>,
      );
    }

    lastIndex = matchStart + matchedText.length;
    match = regex.exec(text);
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts;
}

// ---------------------------------------------------------------------------
// AssistantWidget Component
// ---------------------------------------------------------------------------

export function AssistantWidget({
  organizationId,
  organizationSlug,
}: {
  organizationId: string;
  organizationSlug: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showInvite, setShowInvite] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [thread, setThread] = useState<AssistantThread | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 1. Initialise: get or create the assistant thread
  useEffect(() => {
    async function init() {
      try {
        const threadRes = await fetch(
          `/api/assistant/thread?organizationId=${encodeURIComponent(organizationId)}`,
          { cache: "no-store" },
        );
        if (!threadRes.ok) return;
        const threadData = (await threadRes.json()) as {
          thread: AssistantThread;
        };
        setThread(threadData.thread);

        // Fetch message history
        const msgRes = await fetch(
          `/api/chat/threads/${encodeURIComponent(threadData.thread.id)}`,
          { cache: "no-store" },
        );
        if (msgRes.ok) {
          const msgData = (await msgRes.json()) as {
            thread?: { messages?: AssistantMessage[] };
          };
          const loaded = msgData.thread?.messages ?? [];
          setMessages(
            loaded
              .filter((m) => m.role === "user" || m.role === "assistant")
              .map((m) => {
                const metadata = (
                  m as AssistantMessage & {
                    metadata?: Record<string, unknown>;
                  }
                ).metadata;
                return {
                  ...m,
                  toolResults:
                    (metadata?.toolResults as AssistantMessage["toolResults"]) ??
                    m.toolResults,
                  navigationRoute:
                    (metadata?.navigationRoute as string | undefined) ??
                    m.navigationRoute,
                  reminderId:
                    (metadata?.reminderId as string | undefined) ??
                    m.reminderId,
                  ticketRef:
                    (metadata?.ticketRef as string | undefined) ?? m.ticketRef,
                };
              }),
          );
        }
      } catch {
        // Non-fatal
      }
    }
    void init();
  }, [organizationId]);

  // 2. Collapse the invitation pill after a short discovery window. The
  // mascot remains available, but the text no longer sits on top of workspace
  // controls such as the creative conversation Send button.
  useEffect(() => {
    if (open || !showInvite) return;

    const timer = window.setTimeout(() => setShowInvite(false), 2500);
    return () => window.clearTimeout(timer);
  }, [open, showInvite]);

  // 3. Scroll to bottom on new messages
  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open]);

  // 4. Focus compose input when panel opens
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [open]);

  // 5. Poll due reminders periodically
  useEffect(() => {
    async function fetchReminders() {
      try {
        const res = await fetch(
          `/api/assistant/reminders?organizationId=${encodeURIComponent(organizationId)}`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const data = (await res.json()) as { reminders: Reminder[] };
          if (data.reminders.length > 0) {
            setReminders((prev) => {
              const existingIds = new Set(prev.map((r) => r.id));
              const fresh = data.reminders.filter(
                (r) => !existingIds.has(r.id),
              );
              if (fresh.length > 0) {
                setUnreadCount((c) => c + fresh.length);
              }
              return [...prev, ...fresh];
            });
          }
        }
      } catch {
        // Non-fatal
      }
    }

    void fetchReminders();
    const interval = setInterval(() => {
      void fetchReminders();
    }, 45_000);

    return () => clearInterval(interval);
  }, [organizationId]);

  const handleOpen = useCallback(() => {
    setShowInvite(false);
    setOpen(true);
    setUnreadCount(0);
  }, []);

  // 6. Send message
  const handleSend = useCallback(
    async (messageText?: string) => {
      const text = (messageText ?? input).trim();
      if (!text || !thread || sending) return;

      setInput("");
      setError(null);
      setSending(true);

      const tempId = `temp-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: tempId, role: "user", content: text },
      ]);

      try {
        const result = await runQuotedTextFeature<{
          content?: string;
          error?: string;
          toolResults?: AssistantMessage["toolResults"];
          navigationRoute?: string;
          reminderId?: string;
          ticketRef?: string;
          assistantMessageId?: string;
          userMessageId?: string;
        }>("/api/assistant/message", {
          threadId: thread.id,
          content: text,
        });

        const typedResult = result as {
          content?: string;
          error?: string;
          toolResults?: AssistantMessage["toolResults"];
          navigationRoute?: string;
          reminderId?: string;
          ticketRef?: string;
          assistantMessageId?: string;
          userMessageId?: string;
        };

        if (!typedResult.content) {
          throw new Error(typedResult.error ?? "Failed to generate reply.");
        }

        setMessages((prev) => [
          ...prev.filter((m) => m.id !== tempId),
          {
            id: typedResult.userMessageId ?? `u-${Date.now()}`,
            role: "user",
            content: text,
          },
          {
            id: typedResult.assistantMessageId ?? `a-${Date.now()}`,
            role: "assistant",
            content: typedResult.content ?? "",
            toolResults: typedResult.toolResults,
            navigationRoute: typedResult.navigationRoute,
            reminderId: typedResult.reminderId,
            ticketRef: typedResult.ticketRef,
          },
        ]);

        // Navigation tools render an explicit action card. Pixel never redirects
        // the workspace without a user click.
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setError(
          err instanceof Error
            ? err.message
            : "Assistant request failed. Please try again.",
        );
      } finally {
        setSending(false);
      }
    },
    [input, thread, sending],
  );

  const handleNavigate = useCallback(
    (route: string) => {
      const safeRoute = route.startsWith("/app/")
        ? route
        : `/app/${encodeURIComponent(organizationSlug)}${
            route.startsWith("/") ? route : `/${route}`
          }`;
      router.push(safeRoute as Parameters<typeof router.push>[0]);
    },
    [organizationSlug, router],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const dismissReminder = (id: string) => {
    setReminders((prev) => prev.filter((r) => r.id !== id));
    fetch(`/api/assistant/reminders?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }).catch(() => undefined);
  };

  return (
    <>
      {/* Reminder notification toast banner */}
      {reminders.length > 0 && (
        <div
          className="fixed bottom-[96px] right-6 z-50 flex flex-col gap-2 pointer-events-auto"
          role="status"
          aria-live="polite"
        >
          {reminders.slice(0, 3).map((r) => (
            <div
              key={r.id}
              className="flex max-w-[340px] items-start gap-3 rounded-2xl border border-success/40 bg-card p-4 shadow-xl transition-all animate-in slide-in-from-bottom-2"
            >
              <div className="relative size-9 shrink-0 overflow-hidden rounded-xl border border-success/30 bg-success/10 p-1">
                <Image
                  src={MASCOT_CELEBRATION}
                  alt=""
                  fill
                  unoptimized
                  aria-hidden="true"
                  className="object-contain"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-foreground">
                  Pixel reminder
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground leading-snug">
                  {r.message}
                </p>
              </div>
              <button
                onClick={() => dismissReminder(r.id)}
                className="shrink-0 rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                aria-label="Dismiss reminder"
              >
                <XIcon size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main Chat Panel (Drawer / Popup) */}
      {open && (
        <div
          role="dialog"
          aria-label="Pixel AI Assistant"
          aria-modal="true"
          className={`fixed z-50 flex flex-col rounded-3xl border border-border bg-card shadow-2xl transition-all duration-300 ease-out backdrop-blur-xl ${
            isExpanded
              ? "bottom-6 right-6 h-[820px] w-[760px] max-h-[calc(100vh-3rem)] max-w-[calc(100vw-3rem)]"
              : "bottom-[88px] right-6 h-[620px] w-[420px] max-h-[calc(100vh-7rem)] max-w-[calc(100vw-2rem)]"
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/80 px-5 py-3.5 bg-card/90 rounded-t-3xl">
            <div className="flex items-center gap-3">
              <div className="relative size-10 shrink-0 overflow-hidden rounded-full border border-border bg-muted/60 p-0.5 shadow-2xs">
                <Image
                  src={MASCOT_WORKING}
                  alt="Pixel Mascot"
                  fill
                  unoptimized
                  className="object-contain p-0.5"
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-hand text-xl font-bold leading-none text-foreground tracking-wide">
                    Pixel
                  </h3>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    AI Assistant
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Aiwa Creator companion
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Expand / Minimize Size Toggle */}
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={
                  isExpanded
                    ? "Collapse to compact panel"
                    : "Expand to larger popup"
                }
                title={isExpanded ? "Collapse" : "Expand"}
              >
                {isExpanded ? (
                  <MinimizeIcon size={15} />
                ) : (
                  <MaximizeIcon size={15} />
                )}
              </button>

              {/* Close Button */}
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Close assistant"
                title="Close"
              >
                <XIcon size={16} />
              </button>
            </div>
          </div>

          {/* Conversation Area */}
          <div
            className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
            role="log"
            aria-label="Conversation with Pixel"
          >
            {messages.length === 0 && !sending && (
              <EmptyState onQuickAction={(msg) => void handleSend(msg)} />
            )}

            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                onNavigate={handleNavigate}
                onCancelReminder={(reminderId) => {
                  fetch(
                    `/api/assistant/reminders?id=${encodeURIComponent(reminderId)}`,
                    {
                      method: "DELETE",
                    },
                  ).catch(() => undefined);
                }}
              />
            ))}

            {/* Thinking / Running State */}
            {sending && (
              <div className="flex items-start gap-3 my-2 animate-in fade-in-50">
                <div className="relative size-7 shrink-0 overflow-hidden rounded-full border border-border bg-muted p-0.5">
                  <Image
                    src={MASCOT_RUNNING}
                    alt=""
                    fill
                    unoptimized
                    className="object-contain"
                    aria-hidden="true"
                  />
                </div>
                <div className="rounded-2xl rounded-tl-xs bg-muted/80 px-4 py-3 shadow-2xs border border-border/40">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-medium">
                      Pixel is thinking…
                    </span>
                    <div className="flex gap-1">
                      <span className="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:0ms]" />
                      <span className="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:150ms]" />
                      <span className="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Error display */}
            {error && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3.5 text-xs text-destructive flex items-start gap-2.5">
                <div className="relative size-5 shrink-0 overflow-hidden">
                  <Image
                    src={MASCOT_CONFUSED}
                    alt=""
                    fill
                    unoptimized
                    className="object-contain"
                  />
                </div>
                <div className="flex-1 leading-relaxed">
                  <p className="font-semibold">Generation notice</p>
                  <p className="mt-0.5 text-destructive/90">{error}</p>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Compose Footer */}
          <div className="border-t border-border/80 p-4 bg-card/90 rounded-b-3xl">
            <div className="flex items-end gap-2.5 rounded-2xl border border-border bg-background px-3.5 py-2.5 shadow-2xs focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Pixel anything (balance, errors, reminders, features)…"
                rows={1}
                disabled={sending || !thread}
                className="min-h-[26px] flex-1 resize-none bg-transparent text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
                style={{ maxHeight: 120 }}
                aria-label="Message input"
              />
              <Button
                size="sm"
                variant="default"
                onClick={() => {
                  void handleSend();
                }}
                disabled={!input.trim() || sending || !thread}
                className="shrink-0 size-8 p-0 rounded-xl"
                aria-label="Send message"
              >
                <SendIcon size={14} />
              </Button>
            </div>
            <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-muted-foreground">
              <span>
                Press{" "}
                <kbd className="font-mono bg-muted px-1 py-0.5 rounded text-[10px]">
                  Enter
                </kbd>{" "}
                to send
              </span>
              <span className="font-mono text-[10px]">Aiwa Mascot v1.0</span>
            </div>
          </div>
        </div>
      )}

      {/* Floating Mascot Trigger Button */}
      <div
        className={`fixed bottom-6 right-6 z-50 flex items-center transition-[gap] duration-300 ${
          !open && showInvite ? "gap-3" : "gap-0"
        }`}
      >
        {/* Floating invitation pill when closed. It rolls back into the mascot
            after 2.5s so it never permanently obscures nearby controls. */}
        {!open && (
          <button
            type="button"
            onClick={handleOpen}
            tabIndex={showInvite ? 0 : -1}
            aria-hidden={!showInvite}
            className={`hidden sm:flex items-center overflow-hidden whitespace-nowrap rounded-full border bg-card/95 py-1.5 text-xs font-semibold text-foreground backdrop-blur-md transition-[max-width,opacity,transform,padding,border-color,box-shadow] duration-300 ease-out ${
              showInvite
                ? "max-w-32 translate-x-0 border-border px-3.5 opacity-100 shadow-lg hover:border-primary/50 hover:shadow-xl"
                : "pointer-events-none max-w-0 translate-x-2 border-transparent px-0 opacity-0 shadow-none"
            }`}
            aria-label="Open Pixel assistant"
          >
            <span className="font-hand text-sm text-primary">✨ Ask Pixel</span>
          </button>
        )}

        <button
          onClick={open ? () => setOpen(false) : handleOpen}
          className="relative flex size-15 items-center justify-center overflow-hidden rounded-full border-2 border-primary/40 bg-card shadow-xl transition-all duration-200 hover:shadow-2xl hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 cursor-pointer"
          aria-label={open ? "Close Pixel assistant" : "Open Pixel assistant"}
          aria-expanded={open}
        >
          {/* Subtle animated halo */}
          <div className="absolute inset-0 rounded-full bg-primary/10 animate-pulse pointer-events-none" />

          <Image
            src={MASCOT_WORKING}
            alt="Pixel Mascot Button"
            width={52}
            height={52}
            unoptimized
            className="object-contain p-1 relative z-10"
            aria-hidden="true"
          />

          {unreadCount > 0 && (
            <span
              aria-label={`${unreadCount} notifications`}
              className="absolute right-1 top-1 z-20 flex size-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground shadow-md animate-bounce"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Empty State & Mascot Greeting
// ---------------------------------------------------------------------------

function EmptyState({
  onQuickAction,
}: {
  onQuickAction: (message: string) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-6 text-center space-y-4">
      <div className="relative size-28 overflow-hidden rounded-3xl border border-border bg-muted/60 p-3 shadow-xs">
        <Image
          src={MASCOT_WORKING}
          alt=""
          fill
          unoptimized
          className="object-contain p-1.5"
          aria-hidden="true"
        />
      </div>

      <div>
        <h4 className="font-hand text-2xl font-bold text-foreground">
          Hello! I&apos;m Pixel
        </h4>
        <p className="mt-1 text-xs sm:text-sm text-muted-foreground max-w-xs">
          Your creative mascot companion. I can query balances, check running
          jobs, set reminders, explain errors, or guide you anywhere in the app.
        </p>
      </div>

      <div className="w-full pt-2">
        <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          Suggested Actions
        </p>
        <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
          {QUICK_ACTIONS.map((qa) => (
            <button
              key={qa.label}
              onClick={() => onQuickAction(qa.message)}
              className="rounded-xl border border-border/70 bg-muted/50 p-2.5 text-xs text-foreground transition-all hover:border-primary/50 hover:bg-primary/10 hover:shadow-2xs text-left"
            >
              <span className="font-semibold block">{qa.label}</span>
              <span className="text-[11px] text-muted-foreground line-clamp-1">
                {qa.message}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message Bubble & Tool Result Cards
// ---------------------------------------------------------------------------

function MessageBubble({
  message,
  onNavigate,
  onCancelReminder,
}: {
  message: AssistantMessage;
  onNavigate: (route: string) => void;
  onCancelReminder: (id: string) => void;
}) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex items-start gap-3 my-3 ${
        isUser ? "flex-row-reverse" : ""
      }`}
    >
      {!isUser && (
        <div className="relative size-7 shrink-0 overflow-hidden rounded-full border border-border bg-muted p-0.5">
          <Image
            src={MASCOT_WORKING}
            alt=""
            fill
            unoptimized
            className="object-contain"
            aria-hidden="true"
          />
        </div>
      )}

      <div
        className={`flex max-w-[85%] flex-col gap-2 ${
          isUser ? "items-end" : "items-start"
        }`}
      >
        <div
          className={`rounded-2xl px-4 py-3 text-xs sm:text-sm leading-relaxed shadow-2xs ${
            isUser
              ? "rounded-tr-xs bg-primary text-primary-foreground font-medium"
              : "rounded-tl-xs bg-muted/80 text-foreground border border-border/50"
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <FormattedContent text={message.content} onNavigate={onNavigate} />
          )}
        </div>

        {/* Tool Result Cards */}
        {message.toolResults?.map((tr, i) => (
          <ToolCard
            key={i}
            toolResult={tr}
            onNavigate={onNavigate}
            onCancelReminder={onCancelReminder}
          />
        ))}

        {/* Reminder Confirmation Badge */}
        {message.reminderId && (
          <div className="flex items-center gap-2 rounded-xl border border-success/40 bg-success/10 px-3 py-1.5 text-xs text-foreground font-medium">
            <span className="size-2 rounded-full bg-success" />
            <span>Reminder scheduled successfully</span>
          </div>
        )}

        {/* Support Ticket Confirmation Badge */}
        {message.ticketRef && (
          <div className="flex items-center gap-2 rounded-xl border border-info/40 bg-info/10 px-3 py-1.5 text-xs text-foreground font-medium">
            <span className="font-mono text-[11px] font-bold text-info">
              {message.ticketRef}
            </span>
            <span>Developer support team alerted</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tool Result Card Detail Renderers
// ---------------------------------------------------------------------------

function ToolCard({
  toolResult,
  onNavigate,
  onCancelReminder,
}: {
  toolResult: NonNullable<AssistantMessage["toolResults"]>[number];
  onNavigate: (route: string) => void;
  onCancelReminder: (id: string) => void;
}) {
  if (toolResult.error) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
        <p className="font-semibold">Tool execution error</p>
        <p className="mt-0.5 text-[11px]">{toolResult.error}</p>
      </div>
    );
  }

  const output = (toolResult.output ?? {}) as Record<string, unknown>;

  // 1. Balance Tool Card
  if (toolResult.tool === "app.getBalance") {
    return (
      <div className="rounded-2xl border border-border bg-card p-3.5 shadow-2xs w-full max-w-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Workspace Balance
          </span>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
            Active
          </span>
        </div>
        <p className="mt-1 font-display text-xl font-bold text-foreground">
          {String(output.balanceDisplay ?? `${output.balanceCredits} credits`)}
        </p>
        <div className="mt-2.5 pt-2 border-t border-border/60 flex justify-end">
          <button
            type="button"
            onClick={() => onNavigate("/settings")}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Top up or view ledger →
          </button>
        </div>
      </div>
    );
  }

  // 2. Recent Jobs Tool Card
  if (toolResult.tool === "app.getJobStatus" && Array.isArray(output.jobs)) {
    const jobs = output.jobs as Array<{
      id: string;
      status: string;
      model: string;
      mediaKind: string;
      createdAt: string;
      errorMessage?: string;
    }>;

    return (
      <div className="rounded-2xl border border-border bg-card p-3.5 shadow-2xs w-full max-w-sm space-y-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Recent Generation Jobs
        </span>
        <div className="divide-y divide-border/60">
          {jobs.slice(0, 4).map((j) => (
            <div
              key={j.id}
              className="py-2 flex items-center justify-between gap-2"
            >
              <div className="min-w-0 flex items-center gap-2">
                <span
                  className={`size-2 shrink-0 rounded-full ${
                    j.status === "SUCCEEDED"
                      ? "bg-success"
                      : j.status === "FAILED"
                        ? "bg-destructive"
                        : "bg-warning animate-pulse"
                  }`}
                  aria-label={j.status}
                />
                <span className="truncate text-xs font-medium text-foreground">
                  {j.model}
                </span>
              </div>
              <span className="font-mono text-[10px] text-muted-foreground uppercase shrink-0">
                {j.status}
              </span>
            </div>
          ))}
        </div>
        <div className="pt-1 flex justify-end">
          <button
            type="button"
            onClick={() => onNavigate("/assets")}
            className="text-xs font-semibold text-primary hover:underline"
          >
            View all generation logs →
          </button>
        </div>
      </div>
    );
  }

  // 3. Recent Assets Tool Card
  if (toolResult.tool === "app.getAssets" && Array.isArray(output.assets)) {
    const assets = output.assets as Array<{
      id: string;
      name: string;
      kind: string;
      createdAt: string;
    }>;

    return (
      <div className="rounded-2xl border border-border bg-card p-3.5 shadow-2xs w-full max-w-sm space-y-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Recent Media Assets
        </span>
        <div className="divide-y divide-border/60">
          {assets.slice(0, 4).map((a) => (
            <div
              key={a.id}
              className="py-1.5 flex items-center justify-between gap-2"
            >
              <span className="truncate text-xs text-foreground font-medium">
                {a.name}
              </span>
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                {a.kind}
              </span>
            </div>
          ))}
        </div>
        <div className="pt-1 flex justify-end">
          <button
            type="button"
            onClick={() => onNavigate("/assets")}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Open Asset Library →
          </button>
        </div>
      </div>
    );
  }

  // 4. Error Explanation Card
  if (toolResult.tool === "app.explainError") {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 shadow-2xs w-full max-w-sm space-y-2">
        <div className="flex items-center gap-2">
          <span className="font-bold text-xs text-destructive uppercase tracking-wider">
            Issue Diagnosis
          </span>
          <span className="font-semibold text-xs text-foreground">
            {String(output.title ?? "Error Explained")}
          </span>
        </div>
        <p className="text-xs text-foreground/90 leading-relaxed">
          {String(output.explanation)}
        </p>
        {output.remediation ? (
          <div className="rounded-xl border border-destructive/20 bg-background/80 p-2.5 text-xs text-foreground">
            <strong className="block text-[11px] font-semibold text-destructive">
              Recommended Fix:
            </strong>
            <p className="mt-0.5 text-xs">{String(output.remediation)}</p>
          </div>
        ) : null}
      </div>
    );
  }

  // 5. Reminder Confirmed Card
  if (toolResult.tool === "app.setReminder") {
    return (
      <div className="rounded-2xl border border-success/40 bg-success/10 p-3.5 shadow-2xs w-full max-w-sm space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-success uppercase">
            Reminder Set
          </span>
          {output.reminderId ? (
            <button
              type="button"
              onClick={() => onCancelReminder(String(output.reminderId))}
              className="text-[11px] font-semibold text-destructive hover:underline"
            >
              Cancel
            </button>
          ) : null}
        </div>
        <p className="text-xs text-foreground font-medium">
          &ldquo;{String(output.message)}&rdquo;
        </p>
        <p className="text-[11px] text-muted-foreground font-mono">
          Scheduled for:{" "}
          {new Date(String(output.remindAt)).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    );
  }

  // 6. Navigation Card
  if (toolResult.tool === "app.navigate" && output.route) {
    return (
      <div className="rounded-2xl border border-border bg-card p-3 shadow-2xs w-full max-w-sm flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground font-mono truncate">
          {String(output.route)}
        </span>
        <button
          type="button"
          onClick={() => onNavigate(String(output.route))}
          className="rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-colors shrink-0"
        >
          Navigate →
        </button>
      </div>
    );
  }

  // 7. Support Ticket Card
  if (toolResult.tool === "app.escalate") {
    return (
      <div className="rounded-2xl border border-info/40 bg-info/10 p-3.5 shadow-2xs w-full max-w-sm space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-info uppercase">
            Support Escalation
          </span>
          <span className="rounded bg-info/20 px-2 py-0.5 font-mono text-[10px] font-bold text-info">
            {String(output.ticketRef ?? "TICKET")}
          </span>
        </div>
        <p className="text-xs text-foreground font-medium">
          {String(output.subject)}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {String(output.message)}
        </p>
      </div>
    );
  }

  return null;
}
