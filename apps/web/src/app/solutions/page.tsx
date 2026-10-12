import type { Metadata, Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { getPublicPricingCatalogue } from "@/lib/public-pricing";
import { pricingCategories } from "@/lib/public-pricing-contract";
import { solutions } from "@/lib/public-solutions";
import { Icon } from "@/components/ui/icon";
import { SolutionsFinder } from "@/components/marketing/solutions/solutions-finder";
import { SolutionModels } from "@/components/marketing/solutions/solution-models";
import {
  SectionTitle,
  SolutionCard,
  SolutionFaq,
  SolutionsConversion,
  SolutionsFooter,
  SolutionsHeader,
} from "@/components/marketing/solutions/solution-components";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Creative AI Solutions for Agencies, Retail, Creators & Teams",
  description:
    "Explore outcome-led Aiwa Creators workflows for agencies, e-commerce, content creators, businesses and production teams. Discover the tools and current model pricing.",
  alternates: { canonical: "/solutions" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "One creative platform. Endless possibilities. · Aiwa Creators",
    description:
      "From first brief to campaign visuals, video, voice and finished content. Find your workflow.",
    type: "website",
    images: [
      {
        url: "/solution-art/explorer.svg",
        width: 920,
        height: 650,
        alt: "Creators creative solution campaign illustration",
      },
    ],
  },
};

const questions = [
  {
    question: "Do I need an account to explore the solutions?",
    answer:
      "No. These public guides, the guided finder, tool pages and published pricing are available without signing in. Creating media requires an authenticated workspace.",
  },
  {
    question: "Do the illustrations represent actual customer results?",
    answer:
      "No. The editorial examples are illustrative demonstrations of creative workflows, not client testimonials, measured outcomes or guarantees.",
  },
  {
    question: "Can I combine image, video, voice and creative planning?",
    answer:
      "Yes. Creators brings together several supported workflows in one workspace. Specific models and operations depend on current configuration, capabilities and access.",
  },
  {
    question: "How can I understand what a workflow might cost?",
    answer:
      "The public pricing catalogue shows published customer rates. Actual usage depends on model, task and settings. The authenticated Studio quote is authoritative before supported billable generation.",
  },
  {
    question: "Will using the public finder charge me?",
    answer:
      "No. It uses curated recommendations to link you to relevant guides and existing tools. It never submits provider jobs or accesses a wallet.",
  },
] as const;
const sample = [
  {
    label: "01 / Discover",
    heading: "Start with the customer's objective",
    detail:
      "Develop the campaign message, target audience and creative direction.",
    icon: "director" as const,
  },
  {
    label: "02 / Create",
    heading: "Explore a visual identity",
    detail:
      "Generate model-supported campaign visuals from an approved idea or reference.",
    icon: "image" as const,
  },
  {
    label: "03 / Animate",
    heading: "Put the story in motion",
    detail: "Explore supported shots and promotional clip formats.",
    icon: "video" as const,
  },
  {
    label: "04 / Complete",
    heading: "Prepare your deliverables",
    detail: "Add narration, refine supported media and keep assets together.",
    icon: "assets" as const,
  },
];
export default async function SolutionsPage() {
  const catalogue = await getPublicPricingCatalogue().catch(() => ({
    models: [],
  }));
  const origin = process.env.APP_URL ?? "https://creator.aiwamediagroup.com";
  const schema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Creative AI Solutions",
    url: new URL("/solutions", origin).toString(),
    description: metadata.description,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: solutions.map((solution, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: solution.name,
        url: new URL("/solutions/" + solution.slug, origin).toString(),
      })),
    },
  };
  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <SolutionsHeader />
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
        <div
          className="paper-grid pointer-events-none absolute inset-0 opacity-40"
          aria-hidden="true"
        />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-7 sm:py-20 lg:grid-cols-[1fr_.98fr] lg:items-center lg:px-10 lg:py-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[.15em] text-primary">
              <Icon name="sparkles" className="size-4" /> Creative solutions
            </p>
            <h1 className="font-display mt-6 max-w-2xl text-balance text-5xl font-semibold leading-[1.04] tracking-[-.055em] sm:text-6xl lg:text-[68px]">
              One creative platform.{" "}
              <span className="text-primary">Endless possibilities.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-8 text-muted-foreground">
              Turn an idea into campaigns, product visuals, videos, narration
              and content worth sharing. Explore what Creators can help you
              make, not just the tools behind it.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href="#audiences"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground hover:opacity-90"
              >
                Find your solution <Icon name="arrow" className="size-4" />
              </a>
              <Link
                href="/tools"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-card px-6 py-3 text-sm font-bold hover:bg-secondary"
              >
                Explore all tools
              </Link>
            </div>
            <p className="mt-5 text-xs font-medium text-muted-foreground">
              Browse freely · Guided recommendations · Published customer
              pricing
            </p>
          </div>
          <div className="relative">
            <Image
              src="/solution-art/explorer.svg"
              alt="Original editorial collage showing a creative brief becoming a visual campaign and multimedia deliverables"
              width={920}
              height={650}
              priority
              className="w-full rounded-[30px] border border-border shadow-sketch"
            />
            <span className="absolute -bottom-4 left-4 -rotate-3 rounded-xl border border-border bg-card px-5 py-2 font-hand text-xl shadow-sm sm:left-10">
              An idea can go further ✦
            </span>
          </div>
        </div>
      </section>
      <nav
        aria-label="On this page"
        className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-xl"
      >
        <div className="mx-auto flex max-w-7xl gap-6 overflow-x-auto px-5 py-4 text-xs font-bold sm:px-7 lg:px-10">
          {[
            ["#audiences", "Who it is for"],
            ["#find-your-solution", "Guided finder"],
            ["#journey", "Creative journey"],
            ["#models", "Models"],
            ["#questions", "FAQs"],
          ].map(([href, label]) => (
            <a
              className="shrink-0 text-muted-foreground hover:text-primary"
              key={href}
              href={href}
            >
              {label}
            </a>
          ))}
        </div>
      </nav>
      <section
        id="audiences"
        className="scroll-mt-28 mx-auto max-w-7xl px-5 py-20 sm:px-7 lg:px-10"
      >
        <SectionTitle
          eyebrow="Solutions by audience"
          title="Find the creative flow that fits your work."
          description="Different teams face different challenges. Choose a starting point built around the deliverable, rather than a long list of model names."
        />
        <div className="mt-9 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {solutions.map((solution) => (
            <SolutionCard key={solution.slug} solution={solution} />
          ))}
        </div>
      </section>
      <SolutionsFinder />
      <section
        id="journey"
        className="scroll-mt-28 border-y border-border bg-secondary/30"
      >
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-7 lg:px-10">
          <SectionTitle
            eyebrow="One brief, many deliverables"
            title="See how a campaign takes shape."
            description="An illustrative creative story showing how planning, generation and finishing can build on one another. Availability depends on your enabled models and their supported workflows."
          />
          <div className="mt-10 grid gap-6 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
            <ol className="space-y-3">
              {sample.map((item) => (
                <li
                  key={item.label}
                  className="rounded-2xl border border-border bg-card p-5"
                >
                  <div className="flex gap-4">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <Icon name={item.icon} className="size-5" />
                    </span>
                    <div>
                      <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-primary">
                        {item.label}
                      </p>
                      <h3 className="font-display mt-1 text-lg font-semibold">
                        {item.heading}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {item.detail}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            <div className="grid gap-3 sm:grid-cols-2">
              <Image
                src="/solution-art/marketing-agencies.svg"
                alt="Illustrated campaign concept and creative production board"
                width={920}
                height={650}
                className="w-full rounded-2xl border border-border bg-card sm:col-span-2"
              />
              <Image
                src="/solution-art/ecommerce.svg"
                alt="Illustrated product creative variations"
                width={920}
                height={650}
                className="w-full rounded-2xl border border-border bg-card"
              />
              <Image
                src="/solution-art/social-media-creators.svg"
                alt="Illustrated short-form creative outputs"
                width={920}
                height={650}
                className="w-full rounded-2xl border border-border bg-card"
              />
            </div>
          </div>
          <p className="mt-5 text-xs text-muted-foreground">
            Original concept illustrations. Not customer case studies or exact
            model output.
          </p>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-7 lg:px-10">
        <SectionTitle
          eyebrow="Choose by outcome"
          title="The work comes first. The tools follow."
          description="Explore the complete tool directory when you know what you want to produce, or start from a solution that matches your goals."
        />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [
              "Campaign direction",
              "Plan a brief and visual concept.",
              "/tools/ai-creative-director",
              "director",
            ],
            [
              "Images & products",
              "Explore visual campaign assets.",
              "/tools/ai-image-generator",
              "image",
            ],
            [
              "Video & motion",
              "Create supported promotional clips.",
              "/tools/ai-video-generator",
              "video",
            ],
            [
              "Voice & sound",
              "Make narration for your story.",
              "/tools/ai-voice-generator",
              "voice",
            ],
          ].map(([title, body, url, icon]) => (
            <Link
              key={url}
              href={url as Route}
              className="rounded-2xl border border-border bg-card p-5 transition hover:-translate-y-1 hover:shadow-md"
            >
              <Icon
                name={icon as "director" | "image" | "video" | "voice"}
                className="size-6 text-primary"
              />
              <h3 className="font-display mt-4 text-lg font-semibold">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {body}
              </p>
              <span className="mt-4 inline-block text-xs font-bold text-primary">
                Explore workflow ↗
              </span>
            </Link>
          ))}
        </div>
      </section>
      <div className="border-t border-border">
        <SolutionModels
          models={catalogue.models}
          categories={pricingCategories.map((category) => category.id)}
        />
      </div>
      <section
        id="questions"
        className="scroll-mt-28 mx-auto max-w-4xl px-5 py-16 sm:px-7"
      >
        <SectionTitle
          eyebrow="Before you begin"
          title="Your questions, answered."
        />
        <SolutionFaq questions={questions} />
      </section>
      <div className="mx-auto max-w-7xl px-5 pb-20 sm:px-7 lg:px-10">
        <SolutionsConversion title="Your next creative project starts here." />
      </div>
      <SolutionsFooter />
    </main>
  );
}
