"use client";

import { useCallback, useEffect, useState } from "react";
import type { StudioModelOption } from "@/components/studio/studio-model-select";

export const PROMPT_ENHANCEMENT_MODEL_CHANGED =
  "aiwa:prompt-enhancement-model-changed";

type ModelPreference = {
  modelId: string | null;
  defaultModelId: string | null;
  models: StudioModelOption[];
  savedModelUnavailable: boolean;
};

export function announcePromptEnhancementModelChanged(organizationId: string) {
  window.dispatchEvent(
    new CustomEvent(PROMPT_ENHANCEMENT_MODEL_CHANGED, {
      detail: organizationId,
    }),
  );
}

export function usePromptEnhancementModel(
  organizationId: string,
  initialModelId: string | null = null,
) {
  const [preference, setPreference] = useState<ModelPreference>({
    modelId: initialModelId,
    defaultModelId: initialModelId,
    models: [],
    savedModelUnavailable: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/account/prompt-enhancement-model?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: "no-store" },
      );
      const data = (await response.json()) as ModelPreference & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(
          data.error ?? "Could not load Prompt Enhance settings.",
        );
      setPreference(data);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load Prompt Enhance settings.",
      );
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => {
      void refresh();
    }, 0);
    const onChange = (event: Event) => {
      if ((event as CustomEvent<string>).detail === organizationId)
        void refresh();
    };
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener(PROMPT_ENHANCEMENT_MODEL_CHANGED, onChange);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearTimeout(initialRefresh);
      window.removeEventListener(PROMPT_ENHANCEMENT_MODEL_CHANGED, onChange);
      window.removeEventListener("focus", onFocus);
    };
  }, [organizationId, refresh]);

  const save = useCallback(
    async (modelId: string | null) => {
      setSaving(true);
      setError(null);
      try {
        const response = await fetch("/api/account/prompt-enhancement-model", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ organizationId, modelId }),
        });
        const data = (await response.json()) as {
          modelId?: string | null;
          error?: string;
        };
        if (!response.ok)
          throw new Error(data.error ?? "Could not save Prompt Enhance model.");
        setPreference((current) => ({
          ...current,
          modelId: data.modelId ?? null,
          savedModelUnavailable: false,
        }));
        announcePromptEnhancementModelChanged(organizationId);
        return true;
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not save Prompt Enhance model.",
        );
        return false;
      } finally {
        setSaving(false);
      }
    },
    [organizationId],
  );

  return { ...preference, loading, saving, error, save, refresh };
}
