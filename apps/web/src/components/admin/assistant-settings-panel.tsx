"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/creative";
import { StatusBadge } from "@/components/admin/primitives";
import {
  StudioModelSelect,
  type StudioModelOption,
} from "@/components/studio/studio-model-select";

interface AssistantSettingsData {
  id: string;
  providerModelRecordId: string | null;
  modelDisplayName: string | null;
  pricingMode: "FREE" | "CHARGED";
  systemPromptOverride: string | null;
  enabled: boolean;
}

export function AssistantSettingsPanel({
  initialSettings,
  availableModels,
  canManage,
}: {
  initialSettings: AssistantSettingsData;
  availableModels: StudioModelOption[];
  canManage: boolean;
}) {
  const fallbackModelId = availableModels[0]?.id ?? "";
  const [settings, setSettings] = useState(initialSettings);
  const [providerModelRecordId, setProviderModelRecordId] = useState(
    initialSettings.providerModelRecordId ?? fallbackModelId,
  );
  const [pricingMode, setPricingMode] = useState<"FREE" | "CHARGED">(
    initialSettings.pricingMode,
  );
  const [systemPromptOverride, setSystemPromptOverride] = useState(
    initialSettings.systemPromptOverride ?? "",
  );
  const [enabled, setEnabled] = useState(initialSettings.enabled);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const selectedModel = useMemo(
    () => availableModels.find((model) => model.id === providerModelRecordId),
    [availableModels, providerModelRecordId],
  );

  async function handleSave() {
    if (!canManage || saving || !providerModelRecordId) return;
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerModelRecordId,
          pricingMode,
          systemPromptOverride: systemPromptOverride.trim() || null,
          enabled,
        }),
      });
      const body = (await response.json()) as {
        error?: string;
        settings?: AssistantSettingsData;
      };
      if (!response.ok || !body.settings)
        throw new Error(body.error ?? "Failed to update assistant settings.");
      setSettings(body.settings);
      setNotice({ tone: "success", text: "Pixel settings saved." });
    } catch (error) {
      setNotice({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to update assistant settings.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8 px-4 py-7 sm:px-7 lg:px-9 lg:py-9">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Eyebrow>Operations & AI</Eyebrow>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Pixel AI Assistant
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Configure Pixel&apos;s verified chat model, customer billing mode,
            and optional administrator instructions. Model identity is pinned to
            the canonical provider catalog record.
          </p>
        </div>
        <div className="flex gap-2">
          <StatusBadge tone={settings.enabled ? "success" : "neutral"}>
            {settings.enabled ? "Active" : "Disabled"}
          </StatusBadge>
          <StatusBadge
            tone={settings.pricingMode === "FREE" ? "info" : "warning"}
          >
            {settings.pricingMode === "FREE" ? "Sponsored" : "Catalog billed"}
          </StatusBadge>
        </div>
      </div>

      <div className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-6 shadow-xs sm:flex-row sm:items-center">
        <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl border border-border bg-muted p-2">
          <Image
            src="/brand/mascots/creators-mascot-working-laptop-queued-laptop-float.svg"
            alt="Pixel mascot"
            fill
            unoptimized
            className="object-contain p-1"
          />
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">
            Production runtime
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {settings.modelDisplayName ?? "No model configured"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Charged mode uses the platform&apos;s signed quote, reservation and
            settlement pipeline. Sponsored mode charges the customer zero
            credits.
          </p>
        </div>
      </div>

      <div className="space-y-6 rounded-2xl border border-border bg-card p-6 shadow-xs">
        <div>
          <label className="block text-sm font-semibold text-foreground">
            Active assistant model
          </label>
          <p className="mt-1 text-xs text-muted-foreground">
            Only enabled, configured TEXT models admitted for Character Chat are
            available here.
          </p>
          <StudioModelSelect
            models={availableModels}
            value={providerModelRecordId}
            onChange={setProviderModelRecordId}
            disabled={!canManage}
            ariaLabel="Pixel assistant model"
            className="mt-2 w-full"
          />
          {selectedModel ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {selectedModel.description}
            </p>
          ) : null}
        </div>

        <div>
          <label className="block text-sm font-semibold text-foreground">
            Customer billing
          </label>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={!canManage}
              onClick={() => setPricingMode("FREE")}
              className={`rounded-xl border p-4 text-left transition ${
                pricingMode === "FREE"
                  ? "border-primary bg-primary/10"
                  : "border-border bg-muted/30"
              }`}
            >
              <span className="text-sm font-semibold text-foreground">
                Sponsored / free
              </span>
              <p className="mt-1 text-xs text-muted-foreground">
                Pixel costs zero customer credits. Provider usage remains
                associated with the assistant response.
              </p>
            </button>
            <button
              type="button"
              disabled={!canManage}
              onClick={() => setPricingMode("CHARGED")}
              className={`rounded-xl border p-4 text-left transition ${
                pricingMode === "CHARGED"
                  ? "border-primary bg-primary/10"
                  : "border-border bg-muted/30"
              }`}
            >
              <span className="text-sm font-semibold text-foreground">
                Catalog billed
              </span>
              <p className="mt-1 text-xs text-muted-foreground">
                Uses the selected model&apos;s active catalog price, signed
                quote, wallet reservation and actual-usage settlement.
              </p>
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/30 p-4">
          <div>
            <span className="text-sm font-semibold text-foreground">
              Assistant availability
            </span>
            <p className="text-xs text-muted-foreground">
              Disabled Pixel is not mounted in workspace pages.
            </p>
          </div>
          <button
            type="button"
            disabled={!canManage}
            onClick={() => setEnabled((value) => !value)}
            aria-pressed={enabled}
            className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${
              enabled ? "bg-primary" : "bg-muted"
            } disabled:opacity-50`}
          >
            <span
              className={`pointer-events-none inline-block size-5 rounded-full bg-white shadow transition-transform ${
                enabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        <div>
          <label className="block text-sm font-semibold text-foreground">
            Additional administrator instructions
          </label>
          <p className="mt-1 text-xs text-muted-foreground">
            These are appended to Pixel&apos;s immutable tool and safety
            contract; they do not replace it.
          </p>
          <textarea
            rows={6}
            disabled={!canManage}
            value={systemPromptOverride}
            onChange={(event) => setSystemPromptOverride(event.target.value)}
            className="mt-2 block w-full rounded-xl border border-border bg-background p-3 text-xs font-mono text-foreground focus:border-primary focus:outline-none disabled:opacity-60"
            placeholder="Optional product tone, support guidance, or company-specific context..."
          />
        </div>

        {notice ? (
          <div
            className={`rounded-xl border p-3 text-xs font-medium ${
              notice.tone === "success"
                ? "border-success/30 bg-success/10 text-success"
                : "border-destructive/30 bg-destructive/10 text-destructive"
            }`}
          >
            {notice.text}
          </div>
        ) : null}

        <div className="flex justify-end">
          <Button
            disabled={
              !canManage ||
              saving ||
              !providerModelRecordId ||
              availableModels.length === 0
            }
            onClick={() => void handleSave()}
          >
            {saving ? "Saving..." : "Save Pixel Settings"}
          </Button>
        </div>
      </div>
    </div>
  );
}
