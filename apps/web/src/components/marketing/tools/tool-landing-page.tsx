import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ToolLanding } from "@/lib/public-tool-landings";
import type { PublicPricingItem } from "@/lib/public-pricing-contract";
import type { PublicTool } from "@/lib/public-tools";
import { publicToolById, toolCategories } from "@/lib/public-tools";
import { Icon } from "@/components/ui/icon";
import { ToolCard } from "./tool-explorer";
import { ToolsConversion, ToolsFooter, ToolsHeader } from "./tools-shell";

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="max-w-3xl">
      <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-primary">
        {eyebrow}
      </p>
      <h2 className="font-display mt-3 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
        {title}
      </h2>
      {description ? (
        <p className="mt-5 text-base leading-8 text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  );
}

function ModelPrice({ model }: { model: PublicPricingItem }) {
  if (model.tiers[0]) {
    return (
      <p className="text-xs leading-5 text-muted-foreground">
        From {model.tiers[0].inputCreditsPerMillion} input /{" "}
        {model.tiers[0].outputCreditsPerMillion} output credits per 1M tokens
      </p>
    );
  }
  return (
    <div>
      <p className="font-mono text-sm font-bold tabular-nums">
        {model.baseCredits} credits
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {model.baseOmr}
        {model.exampleOnly ? " · reference configuration" : ""}
      </p>
    </div>
  );
}

function ToolModels({
  landing,
  models,
}: {
  landing: ToolLanding;
  models: readonly PublicPricingItem[];
}) {
  return (
    <section
      id="models"
      className="scroll-mt-28 border-y border-border bg-sidebar/40"
    >
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-7 lg:px-10">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <SectionHeading
            eyebrow="Current model catalogue"
            title="Know what is behind the workflow."
            description={landing.modelIntroduction}
          />
          <Link
            href="/pricing"
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-border bg-card px-5 text-sm font-bold hover:border-primary hover:text-primary lg:self-auto"
          >
            Compare all pricing <Icon name="arrow" className="size-4" />
          </Link>
        </div>
        {models.length ? (
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {models.map((model) => (
              <article
                key={model.kind + ":" + model.id}
                className="rounded-2xl border border-border bg-card p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-display text-xl font-semibold">
                      {model.name}
                    </p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-primary">
                      {model.provider} · {model.category}
                    </p>
                  </div>
                  <span className="rounded-full bg-secondary px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    {model.kind}
                  </span>
                </div>
                <p className="mt-4 line-clamp-3 text-sm leading-6 text-muted-foreground">
                  {model.description}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {model.availableIn.slice(0, 3).map((label) => (
                    <span
                      key={label}
                      className="rounded-full border border-border px-3 py-1 text-[11px] font-semibold"
                    >
                      {label}
                    </span>
                  ))}
                  {model.capabilities.slice(0, 3).map((capability) => (
                    <span
                      key={capability}
                      className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[11px] font-semibold text-primary"
                    >
                      {capability}
                    </span>
                  ))}
                </div>
                <div className="mt-5 border-t border-border pt-5">
                  <ModelPrice model={model} />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-10 rounded-2xl border border-dashed border-border bg-card p-8 text-sm leading-7 text-muted-foreground">
            There are no enabled models or operations with a published customer
            price in this category right now. The workspace will show the
            current options when you open the tool. Check{" "}
            <Link
              href="/pricing"
              className="font-bold text-primary hover:underline"
            >
              Pricing
            </Link>{" "}
            for the complete live catalogue.
          </div>
        )}
        <p className="mt-6 max-w-4xl text-xs leading-6 text-muted-foreground">
          Public prices are reference information. Duration, resolution,
          references, source media and token use can change the final cost. The
          authenticated quote shown before submission is authoritative.
        </p>
      </div>
    </section>
  );
}

export function ToolLandingPage({
  tool,
  landing,
  models,
  origin,
}: {
  tool: PublicTool;
  landing: ToolLanding;
  models: readonly PublicPricingItem[];
  origin: string;
}) {
  const group = toolCategories.find(
    (category) => category.id === tool.category,
  );
  const relatedTools = tool.relatedIds
    .map(publicToolById)
    .filter((item) => item !== undefined);
  const breadcrumbItems = [
    { name: "Home", item: "/" },
    { name: "All tools", item: "/tools" },
    { name: tool.title, item: `/tools/${tool.slug}` },
  ];
  const schema = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: breadcrumbItems.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.name,
        item: new URL(item.item, origin).toString(),
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: tool.title,
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Web",
      url: new URL(`/tools/${tool.slug}`, origin).toString(),
      description: landing.seoDescription,
      image: new URL(landing.screenshot.src, origin).toString(),
      featureList: landing.features.map((feature) => feature.title),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: landing.questions.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    },
  ];

  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <ToolsHeader />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(schema).replace(/</g, "\\u003c"),
        }}
      />

      <section className="relative overflow-hidden border-b border-border">
        <div
          className="creative-glow pointer-events-none absolute inset-0"
          aria-hidden="true"
        />
        <div className="relative mx-auto max-w-7xl px-5 py-5 sm:px-7 lg:px-10">
          <nav
            aria-label="Breadcrumb"
            className="flex flex-wrap gap-2 text-xs font-semibold text-muted-foreground"
          >
            <Link href="/" className="hover:text-primary">
              Home
            </Link>
            <span aria-hidden="true">/</span>
            <Link href="/tools" className="hover:text-primary">
              Tools
            </Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page" className="text-foreground">
              {tool.title}
            </span>
          </nav>
        </div>
        <div className="relative mx-auto max-w-7xl px-5 pb-16 pt-7 sm:px-7 lg:px-10 lg:pb-24">
          <div className="grid gap-10 lg:grid-cols-[.85fr_1.15fr] lg:items-center">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-primary">
                <Icon name={tool.icon} className="size-4" /> {group?.label}
              </p>
              <p className="mt-6 text-sm font-bold text-primary">
                {landing.eyebrow}
              </p>
              <h1 className="font-display mt-3 text-balance text-5xl font-semibold leading-[1.03] tracking-[-.055em] sm:text-6xl">
                {landing.hero}
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-muted-foreground">
                {landing.introduction}
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link
                  href={`/tools/start/${tool.id}` as Route}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground hover:opacity-90"
                >
                  Open {tool.title} <Icon name="arrow" className="size-4" />
                </Link>
                <Link
                  href="/pricing"
                  className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-card px-6 py-3 text-sm font-bold hover:bg-secondary"
                >
                  Compare models & pricing
                </Link>
              </div>
              <div className="mt-7 flex flex-wrap gap-x-5 gap-y-3 text-xs font-semibold text-muted-foreground">
                {landing.proof.map((item) => (
                  <span key={item} className="inline-flex items-center gap-2">
                    <Icon name="check" className="size-4 text-primary" /> {item}
                  </span>
                ))}
              </div>
            </div>

            <figure className="overflow-hidden rounded-[28px] border border-border bg-card shadow-sketch">
              <div className="flex items-center justify-between border-b border-border bg-secondary/50 px-4 py-3">
                <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Real product screen
                </span>
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                  <span className="size-2 rounded-full bg-amber-400" /> Example
                  brief only
                </span>
              </div>
              <Image
                src={landing.screenshot.src}
                alt={landing.screenshot.alt}
                width={1060}
                height={740}
                priority
                sizes="(max-width: 1024px) 100vw, 56vw"
                className="h-auto w-full"
              />
              <figcaption className="border-t border-border px-5 py-4 text-xs leading-6 text-muted-foreground">
                <span className="font-semibold text-foreground">
                  Example entered:
                </span>{" "}
                “{landing.screenshot.prompt}” No generation, audition,
                processing or chat request was submitted for this capture.
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      <nav
        aria-label="On this tool page"
        className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur-xl"
      >
        <div className="mx-auto flex max-w-7xl gap-6 overflow-x-auto px-5 py-4 text-xs font-bold text-muted-foreground sm:px-7 lg:px-10">
          {[
            ["#outcomes", "Why use it"],
            ["#capabilities", "Capabilities"],
            ["#workflow", "How it works"],
            ["#models", "Models"],
            ["#faq", "FAQ"],
          ].map(([href, label]) => (
            <a key={href} href={href} className="shrink-0 hover:text-primary">
              {label}
            </a>
          ))}
        </div>
      </nav>

      <section
        id="outcomes"
        className="scroll-mt-24 mx-auto max-w-7xl px-5 py-20 sm:px-7 lg:px-10"
      >
        <SectionHeading
          eyebrow="What changes"
          title="A focused tool for a real part of the job."
          description={`Use ${tool.title} when this is the creative decision in front of you—not because every project needs every AI workflow.`}
        />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {landing.outcomes.map((outcome) => (
            <article
              key={outcome.title}
              className="rounded-2xl border border-border bg-card p-6"
            >
              <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                <Icon name={outcome.icon} className="size-5" />
              </span>
              <h3 className="font-display mt-6 text-2xl font-semibold">
                {outcome.title}
              </h3>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                {outcome.description}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section
        id="capabilities"
        className="scroll-mt-24 border-y border-border bg-sidebar/40"
      >
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-7 lg:px-10">
          <SectionHeading
            eyebrow="What it includes"
            title={`Inside ${tool.title}.`}
            description="Controls stay specific to the task and to the model or operation you choose. That keeps the interface useful—and the claims honest."
          />
          <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {landing.features.map((feature, index) => (
              <article key={feature.title} className="bg-card p-6">
                <span className="font-hand text-3xl font-bold text-primary">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="font-display mt-4 text-xl font-semibold">
                  {feature.title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  {feature.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        id="workflow"
        className="scroll-mt-24 mx-auto max-w-7xl px-5 py-20 sm:px-7 lg:px-10"
      >
        <SectionHeading
          eyebrow="A practical workflow"
          title="From rough input to a result worth reviewing."
          description="The tool makes the steps clearer; you still decide what is good, accurate, permitted and ready to leave the workspace."
        />
        <ol className="mt-10 grid gap-4 lg:grid-cols-4">
          {landing.steps.map((step, index) => (
            <li
              key={step.title}
              className="relative rounded-2xl border border-border bg-card p-6"
            >
              <span className="font-hand text-4xl font-bold text-primary">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="font-display mt-5 text-xl font-semibold">
                {step.title}
              </h3>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                {step.description}
              </p>
            </li>
          ))}
        </ol>

        <div className="mt-8 grid overflow-hidden rounded-2xl border border-border bg-card md:grid-cols-2">
          <div className="p-7 md:border-r md:border-border">
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-primary">
              What goes in
            </p>
            <ul className="mt-5 space-y-3">
              {landing.inputs.map((item) => (
                <li key={item} className="flex gap-3 text-sm leading-6">
                  <Icon
                    name="arrow"
                    className="mt-1 size-4 shrink-0 text-primary"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="border-t border-border p-7 md:border-t-0">
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-primary">
              What comes out
            </p>
            <ul className="mt-5 space-y-3">
              {landing.outputs.map((item) => (
                <li key={item} className="flex gap-3 text-sm leading-6">
                  <Icon
                    name="check"
                    className="mt-1 size-4 shrink-0 text-primary"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-sidebar/40">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-7 lg:px-10">
          <SectionHeading
            eyebrow="Where it earns its place"
            title="Useful work, not a generic AI demo."
          />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {landing.useCases.map((useCase) => (
              <article
                key={useCase.title}
                className="rounded-2xl border border-border bg-card p-6"
              >
                <h3 className="font-display text-2xl font-semibold">
                  {useCase.title}
                </h3>
                <p className="mt-4 text-sm leading-7 text-muted-foreground">
                  {useCase.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <ToolModels landing={landing} models={models} />

      <section className="mx-auto grid max-w-7xl gap-10 px-5 py-20 sm:px-7 lg:grid-cols-[.8fr_1.2fr] lg:px-10">
        <div>
          <SectionHeading
            eyebrow="Use it thoughtfully"
            title="A few things worth checking."
          />
        </div>
        <div className="space-y-3">
          {landing.notes.map((note) => (
            <div
              key={note}
              className="flex gap-4 rounded-2xl border border-border bg-card p-5"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <Icon name="shield" className="size-4" />
              </span>
              <p className="pt-1 text-sm leading-7 text-muted-foreground">
                {note}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-sidebar/40">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-7 lg:px-10">
          <SectionHeading
            eyebrow="Keep exploring"
            title="Connect this tool to the rest of the work."
          />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {landing.relatedContent.map((item) => (
              <Link
                key={item.href}
                href={item.href as Route}
                className="group rounded-2xl border border-border bg-card p-6 hover:border-primary"
              >
                <p className="font-display text-2xl font-semibold group-hover:text-primary">
                  {item.label}
                </p>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  {item.description}
                </p>
                <span className="mt-6 inline-flex items-center gap-2 text-xs font-bold text-primary">
                  Explore <Icon name="arrow" className="size-4" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section
        id="faq"
        className="scroll-mt-24 mx-auto max-w-4xl px-5 py-20 sm:px-7"
      >
        <SectionHeading
          eyebrow="Frequently asked questions"
          title={`Straight answers about ${tool.title}.`}
        />
        <div className="mt-10 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {landing.questions.map((item) => (
            <details key={item.question} className="group p-6">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-lg font-semibold">
                {item.question}
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-primary transition group-open:rotate-45">
                  <Icon name="plus" className="size-4" />
                </span>
              </summary>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </section>

      <section className="border-t border-border bg-sidebar/40">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-7 lg:px-10">
          <SectionHeading
            eyebrow="Related tools"
            title="The next useful step is already nearby."
          />
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {relatedTools.slice(0, 3).map((item) => (
              <ToolCard key={item.id} tool={item} />
            ))}
          </div>
          <Link
            href="/tools"
            className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-5 text-sm font-bold hover:border-primary hover:text-primary"
          >
            Browse all tools <Icon name="arrow" className="size-4" />
          </Link>
        </div>
      </section>

      <ToolsConversion />
      <ToolsFooter />
    </main>
  );
}
