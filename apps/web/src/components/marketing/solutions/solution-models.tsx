import Link from "next/link";
import type {
  PricingCategory,
  PublicPricingItem,
} from "@/lib/public-pricing-contract";
import { pricingCategories } from "@/lib/public-pricing-contract";
import { relevantModels } from "@/lib/public-solutions";
import { Icon, type IconName } from "@/components/ui/icon";
import { SectionTitle } from "./solution-components";

const icons: Record<PricingCategory, IconName> = {
  chat: "chat",
  image: "image",
  video: "video",
  speech: "voice",
  audio: "voice",
  transcription: "script",
  avatar: "user",
  tools: "wand",
};

function PriceCell({ model }: { model: PublicPricingItem }) {
  if (model.tiers.length > 0) {
    return (
      <div className="space-y-1 text-xs tabular-nums">
        {model.tiers.map((tier) => (
          <p key={tier.maxPromptTokens}>
            Up to {tier.maxPromptTokens.toLocaleString("en-US")} context:
            <span className="block font-semibold">
              {tier.inputCreditsPerMillion} in / {tier.outputCreditsPerMillion}{" "}
              out credits per 1M tokens
            </span>
          </p>
        ))}
      </div>
    );
  }
  return (
    <div className="tabular-nums">
      <p className="font-bold">{model.baseCredits} credits</p>
      <p className="mt-1 text-xs text-muted-foreground">{model.baseOmr}</p>
      {model.exampleOnly ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Reference only; settings affect final quote
        </p>
      ) : null}
    </div>
  );
}

export function SolutionModels({
  models,
  categories,
  compact = false,
}: {
  models: readonly PublicPricingItem[];
  categories: readonly PricingCategory[];
  compact?: boolean;
}) {
  const selected = relevantModels(models, categories);
  return (
    <section
      id="models"
      className="scroll-mt-28 mx-auto max-w-7xl px-5 py-16 sm:px-7 lg:px-10"
    >
      <SectionTitle
        eyebrow="Models behind the work"
        title="The right model for each creative task."
        description="Explore enabled, configured models with published customer pricing. These public references never replace the exact quote shown for your chosen Studio settings."
      />
      <nav aria-label="Model categories" className="mt-7 flex flex-wrap gap-2">
        {pricingCategories
          .filter((category) => categories.includes(category.id))
          .map((category) => (
            <a
              key={category.id}
              href={"#models-" + category.id}
              className="inline-flex min-h-10 items-center rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold hover:border-primary hover:text-primary"
            >
              {category.label}
            </a>
          ))}
      </nav>
      <div className="mt-10 space-y-12">
        {pricingCategories
          .filter((category) => categories.includes(category.id))
          .map((category) => {
            const rows = selected.filter(
              (model) => model.category === category.id,
            );
            return (
              <div
                id={"models-" + category.id}
                key={category.id}
                className="scroll-mt-28"
              >
                <div className="mb-4 flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Icon name={icons[category.id]} className="size-5" />
                  </span>
                  <div>
                    <h3 className="font-display text-2xl font-semibold">
                      {category.label}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {category.description}
                    </p>
                  </div>
                </div>
                {rows.length ? (
                  <div className="overflow-x-auto rounded-2xl border border-border bg-card">
                    <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                      <caption className="sr-only">
                        {category.label} currently published model and operation
                        rates
                      </caption>
                      <thead className="bg-secondary/60 text-xs">
                        <tr>
                          <th scope="col" className="p-4 font-bold">
                            Model / operation
                          </th>
                          <th scope="col" className="p-4 font-bold">
                            Provider
                          </th>
                          <th scope="col" className="p-4 font-bold">
                            Capabilities & available in
                          </th>
                          <th scope="col" className="p-4 font-bold">
                            Billing basis
                          </th>
                          <th scope="col" className="p-4 font-bold">
                            Published customer reference
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {(compact ? rows.slice(0, 5) : rows).map((model) => (
                          <tr
                            key={model.kind + ":" + model.id}
                            className="border-t border-border align-top"
                          >
                            <th scope="row" className="max-w-52 p-4 font-bold">
                              {model.name}
                            </th>
                            <td className="p-4 text-muted-foreground">
                              {model.provider}
                            </td>
                            <td className="max-w-xs p-4 text-xs leading-5 text-muted-foreground">
                              {model.capabilities.slice(0, 4).join(" · ") ||
                                model.description}
                              <span className="mt-2 block font-semibold text-foreground">
                                {model.availableIn.join(", ")}
                              </span>
                            </td>
                            <td className="p-4 text-xs">
                              {model.dimension} / {model.unitQuantity}
                            </td>
                            <td className="p-4">
                              <PriceCell model={model} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {compact && rows.length > 5 ? (
                      <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
                        Showing 5 of {rows.length} entries. Browse Pricing for
                        every published model.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
                    No configured models with published customer pricing are
                    currently listed in this category.{" "}
                    <Link
                      href="/pricing"
                      className="font-bold text-primary hover:underline"
                    >
                      Check current pricing →
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
      </div>
      <p className="mt-6 text-xs leading-6 text-muted-foreground">
        Variable duration, resolution, inputs, reference materials and token
        usage may change the price. Only the authenticated Studio quote is
        authoritative before a generation is submitted.
      </p>
      <Link
        href="/pricing"
        className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-5 text-sm font-bold hover:bg-secondary"
      >
        Explore all customer pricing <Icon name="arrow" className="size-4" />
      </Link>
    </section>
  );
}
