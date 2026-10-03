"use client";

export interface StudioModelOption {
  id: string;
  providerModelId: string;
  name: string;
  provider: string;
  description: string;
  flags: {
    reasoning: boolean;
    fast: boolean;
  };
}

const PROVIDER_LABELS: Readonly<Record<string, string>> = {
  BYTEPLUS: "BytePlus",
  GROQ: "Groq",
  GEMINI: "Gemini",
  CLOUDFLARE: "Cloudflare",
  NVIDIA: "NVIDIA",
};

export function studioModelOptionLabel(model: StudioModelOption): string {
  const provider = PROVIDER_LABELS[model.provider] ?? model.provider;
  return `${model.name} · ${provider}${model.flags.fast ? " · Fast" : ""}`;
}

export function StudioModelSelect({
  models,
  value,
  onChange,
  disabled = false,
  ariaLabel,
  className = "",
}: {
  models: StudioModelOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
}) {
  const selected = models.find((model) => model.id === value);

  return (
    <div className="min-w-0">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled || models.length === 0}
        aria-label={ariaLabel}
        title={selected?.description ?? "Choose an available model"}
        className={`h-10 max-w-full rounded-xl border border-border bg-card px-3 pr-8 text-xs font-semibold text-foreground shadow-xs transition hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      >
        {models.length === 0 ? (
          <option value="">No models available</option>
        ) : (
          models.map((model) => (
            <option key={model.id} value={model.id}>
              {studioModelOptionLabel(model)}
            </option>
          ))
        )}
      </select>
    </div>
  );
}
