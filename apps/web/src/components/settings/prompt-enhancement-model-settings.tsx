"use client";

import { Button } from "@/components/ui/button";
import { StudioModelSelect } from "@/components/studio/studio-model-select";
import { usePromptEnhancementModel } from "@/lib/use-prompt-enhancement-model";

export function PromptEnhancementModelSettings({
  organizationId,
}: {
  organizationId: string;
}) {
  const {
    modelId,
    defaultModelId,
    models,
    loading,
    saving,
    error,
    savedModelUnavailable,
    save,
  } = usePromptEnhancementModel(organizationId);

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-2 block text-xs font-semibold text-foreground">
          Preferred Prompt Enhance model
        </label>
        <StudioModelSelect
          models={models}
          value={modelId ?? ""}
          onChange={(value) => {
            void save(value);
          }}
          disabled={loading || saving}
          ariaLabel="Preferred Prompt Enhance model"
          className="w-full"
        />
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Used across Image and Video Studio. This changes only the model that
          improves your prompts, not the model that generates your media. Prompt
          Enhance does not charge workspace credits.
        </p>
      </div>
      {savedModelUnavailable && (
        <p className="text-xs text-muted-foreground" role="status">
          Your saved model is unavailable. The current default is being used.
        </p>
      )}
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      {loading && (
        <p className="text-xs text-muted-foreground">
          Loading available models…
        </p>
      )}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={
          loading || saving || !models.length || modelId === defaultModelId
        }
        onClick={() => {
          void save(null);
        }}
      >
        {saving ? "Saving…" : "Restore default model"}
      </Button>
    </div>
  );
}
