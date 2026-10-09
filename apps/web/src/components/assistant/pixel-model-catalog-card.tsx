"use client";

type PixelModel = {
  id: string;
  providerModelId: string;
  name?: string;
  displayName?: string;
  provider: string;
  kind?: string;
  mediaKind?: string;
  description?: string;
  tasks?: string[];
  capabilities: Record<string, string | number | boolean | string[]>;
  pricing?: { baseCredits: string; dimension: string; unitQuantity: number };
};

type CatalogResult = {
  models?: PixelModel[];
  total?: number;
  page?: number;
  hasMore?: boolean;
  filter?: { kind?: string | null; query?: string | null };
};

const STUDIO_ROUTES: Record<string, string> = {
  IMAGE: "/image",
  VIDEO: "/video",
  VOICE: "/speech",
  TEXT: "/chat",
};

function modelStudioRoute(model: PixelModel): string | null {
  if (model.kind === "VOICE" || model.mediaKind === "VOICE") {
    if (/seed.?audio/i.test(model.providerModelId)) return "/audio";
    if (
      /transcri|whisper/i.test(model.providerModelId) ||
      (model.tasks ?? []).includes("Transcription")
    )
      return "/speech/transcription";
  }
  return STUDIO_ROUTES[model.kind ?? model.mediaKind ?? ""] ?? null;
}

function capabilityLabel(key: string) {
  return key
    .replace(/^task:/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll(/[-_]/g, " ");
}

function displayCapability(value: PixelModel["capabilities"][string]): string {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function pageRequest(page: number, filter: CatalogResult["filter"]): string {
  const kind = filter?.kind ? String(filter.kind).toLowerCase() + " " : "";
  const query = filter?.query ? " for " + filter.query : "";
  return "Show " + kind + "models page " + page + query;
}

export function PixelModelCatalogCard({
  value,
  onAsk,
  onNavigate,
}: {
  value: unknown;
  onAsk: (message: string) => void;
  onNavigate: (route: string) => void;
}) {
  const result = (value ?? {}) as CatalogResult;
  const models = Array.isArray(result.models) ? result.models : [];
  const page = result.page ?? 1;
  return (
    <section
      className="w-full max-w-lg min-w-0 rounded-2xl border border-border bg-card p-3 shadow-2xs"
      aria-label="Available AI models"
    >
      <div className="flex items-center justify-between gap-2 pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <svg
            className="size-5 shrink-0 text-primary"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <rect x="3" y="7" width="18" height="13" rx="3" />
            <path d="M12 3v4M8 12h.01M16 12h.01M8 16h8" strokeLinecap="round" />
          </svg>
          <h4 className="text-sm font-semibold text-foreground">
            Live AI model catalog
          </h4>
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[11px] tabular-nums text-muted-foreground">
          {result.total ?? models.length} found
        </span>
      </div>
      {models.length === 0 ? (
        <p className="py-3 text-xs text-muted-foreground">
          No configured, enabled and actively priced model matches this search.
          Try another name or category.
        </p>
      ) : (
        <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-0.5">
          {models.map((model) => {
            const capabilityEntries = Object.entries(model.capabilities ?? {})
              .filter(([key]) => !key.startsWith("task:"))
              .slice(0, 35);
            return (
              <article
                key={model.id}
                className="min-w-0 rounded-xl border border-border/70 bg-background/70 p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-1.5">
                  <div className="min-w-0 flex-1">
                    <h5 className="break-words text-xs font-bold text-foreground">
                      {model.name ?? model.displayName ?? "Model"}
                    </h5>
                    <p className="mt-0.5 break-all text-[10px] text-muted-foreground">
                      {model.provider} · {model.providerModelId}
                    </p>
                  </div>
                  <span className="rounded-lg bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">
                    {model.kind ?? model.mediaKind}
                  </span>
                </div>
                {model.description && (
                  <p className="mt-2 text-xs leading-relaxed text-foreground/80">
                    {model.description}
                  </p>
                )}
                {(model.tasks?.length ?? 0) > 0 && (
                  <div
                    className="mt-2 flex flex-wrap gap-1"
                    aria-label="Supported studio tasks"
                  >
                    {(model.tasks ?? []).map((task) => (
                      <span
                        key={task}
                        className="rounded-md border border-border/70 bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {task}
                      </span>
                    ))}
                  </div>
                )}
                {model.pricing && (
                  <div className="mt-2 rounded-lg bg-muted/50 px-2.5 py-2 text-[11px]">
                    <span className="font-semibold text-foreground">
                      {model.pricing.baseCredits} credits
                    </span>
                    <span className="text-muted-foreground">
                      {" "}
                      / {model.pricing.unitQuantity}{" "}
                      {model.pricing.dimension.toLowerCase()} unit(s)
                    </span>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Published base rate only. Final charge depends on the job
                      quote.
                    </p>
                  </div>
                )}
                <details className="group mt-2" open={models.length === 1}>
                  <summary className="cursor-pointer select-none py-1 text-xs font-medium text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                    Technical capabilities & limitations
                  </summary>
                  <dl className="mt-1 grid grid-cols-1 gap-1 border-t border-border/60 pt-2 sm:grid-cols-2">
                    {capabilityEntries.length ? (
                      capabilityEntries.map(([key, capability]) => (
                        <div
                          key={key}
                          className="min-w-0 rounded-md bg-muted/30 px-2 py-1"
                        >
                          <dt className="break-words text-[10px] text-muted-foreground">
                            {capabilityLabel(key)}
                          </dt>
                          <dd className="break-words text-[11px] font-medium text-foreground">
                            {displayCapability(capability)}
                          </dd>
                        </div>
                      ))
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        No additional verified technical limits are published
                        for this model.
                      </p>
                    )}
                  </dl>
                </details>
                <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                  {modelStudioRoute(model) && (
                    <button
                      type="button"
                      className="min-h-9 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium text-foreground hover:bg-muted"
                      onClick={() => onNavigate(modelStudioRoute(model)!)}
                    >
                      Open studio
                    </button>
                  )}
                  <button
                    type="button"
                    className="min-h-9 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90"
                    onClick={() => onAsk("Show model details for " + model.id)}
                  >
                    Ask Pixel
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/70 pt-2">
        <span className="text-[11px] text-muted-foreground">
          Page {page}
          {result.hasMore ? " · more available" : ""}
        </span>
        <div className="flex gap-2">
          {page > 1 && (
            <button
              type="button"
              className="min-h-9 rounded-lg border border-border px-3 text-xs hover:bg-muted"
              onClick={() => onAsk(pageRequest(page - 1, result.filter))}
            >
              Previous
            </button>
          )}
          {result.hasMore && (
            <button
              type="button"
              className="min-h-9 rounded-lg border border-border px-3 text-xs hover:bg-muted"
              onClick={() => onAsk(pageRequest(page + 1, result.filter))}
            >
              Next
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
