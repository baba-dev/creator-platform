import type { Metadata, Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { getPublicPricingCatalogue } from "@/lib/public-pricing";
import { publicTools, toolHref } from "@/lib/public-tools";
import {
  ToolCard,
  ToolDirectory,
} from "@/components/marketing/tools/tool-explorer";
import {
  ToolsConversion,
  ToolsFooter,
  ToolsHeader,
} from "@/components/marketing/tools/tools-shell";
import { Icon } from "@/components/ui/icon";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Explore AI Creative Tools: Image, Video, Voice & More",
  description:
    "Find the right Aiwa Creators tool for your next project. Explore image, video, voice, editing, creative direction and currently published MediaKit tools.",
  alternates: { canonical: "/tools" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Every creative tool. One connected workspace. · Aiwa Creators",
    description:
      "Discover the right creative workflow, compare what tools do and start creating.",
    type: "website",
    images: [
      {
        url: "/tool-art/explorer-hero.svg",
        width: 920,
        height: 690,
        alt: "Aiwa Creators illustrated creative toolbox",
      },
    ],
  },
};
const faqs = [
  {
    q: "Do I need an account to explore the tools?",
    a: "No. The directory, public tool pages and published pricing are accessible without signing in. Creating media requires an authenticated workspace.",
  },
  {
    q: "Which tool should I choose first?",
    a: "Search for an outcome, or use the guided tool finder to match your goal and starting material to an existing workspace tool.",
  },
  {
    q: "How do I know what a generation costs?",
    a: "Explore currently published customer rates on the Pricing page. Your signed-in Studio shows a quote for the actual settings and input before submission.",
  },
  {
    q: "Can I use multiple tools for a campaign?",
    a: "Yes. Use Creative Director to plan, Image and Video Studios to create, Voice Studio for narration, and your workspace to organize the resulting assets.",
  },
  {
    q: "Are every model and MediaKit operation always available?",
    a: "No. Provider configuration, published customer pricing and model capabilities determine availability. The MediaKit operation list reflects eligible published customer pricing.",
  },
];
export default async function ToolsPage() {
  const catalogue = await getPublicPricingCatalogue().catch(() => ({
    models: [],
  }));
  const operations = catalogue.models
    .filter((model) => model.category === "tools" && model.kind === "tool")
    .map((model) => ({
      id: model.id,
      name: model.name,
      description: model.description,
    }));
  const featured = publicTools.filter((tool) => tool.featured);
  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <ToolsHeader />
      <section className="relative overflow-hidden border-b border-border">
        <div
          className="creative-glow pointer-events-none absolute inset-0"
          aria-hidden="true"
        />
        <div
          className="paper-grid pointer-events-none absolute inset-0 opacity-40"
          aria-hidden="true"
        />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-5 py-14 sm:px-7 sm:py-20 lg:grid-cols-[1.02fr_.98fr] lg:items-center lg:px-10 lg:py-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[.15em] text-primary">
              <Icon name="sparkles" className="size-4" /> The creative toolbox
            </p>
            <h1 className="font-display mt-6 max-w-2xl text-balance text-5xl font-semibold leading-[1.04] tracking-[-.055em] sm:text-6xl lg:text-[68px]">
              Every creative tool.{" "}
              <span className="text-primary">One connected workspace.</span>
            </h1>
            <p className="mt-6 max-w-xl text-sm leading-8 text-muted-foreground sm:text-base">
              Make original images, put stories into motion, create narration,
              shape a campaign and finish your media. Find the right starting
              point for what you want to make.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="#directory"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground hover:opacity-90"
              >
                Explore all tools <Icon name="arrow" className="size-4" />
              </Link>
              <Link
                href="#tool-finder"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-card px-6 py-3 text-sm font-bold hover:bg-secondary"
              >
                Find my tool
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-muted-foreground">
              <span>✓ Browse without signing in</span>
              <span>✓ Customer-focused guides</span>
              <Link href="/pricing" className="text-primary hover:underline">
                ✓ Explore published pricing ↗
              </Link>
            </div>
          </div>
          <div className="relative">
            <Image
              src="/tool-art/explorer-hero.svg"
              alt="Original illustration bringing image, video, voice and creative work together"
              width={920}
              height={690}
              priority
              className="w-full rounded-[30px] border border-border shadow-sketch"
            />
            <span className="absolute -bottom-4 left-4 -rotate-3 rounded-xl border border-border bg-card px-5 py-2 font-hand text-xl shadow-sm sm:left-10">
              Find your next idea ✦
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
            ["#featured", "Featured"],
            ["#directory", "All tools"],
            ["#tool-finder", "Find my tool"],
            ["#comparison", "Compare"],
            ["#workflow", "Workflow"],
            ["#faq", "FAQs"],
            ["/pricing", "Pricing"],
          ].map(([href, label]) => (
            <Link
              className="shrink-0 text-muted-foreground hover:text-primary"
              key={href}
              href={href as Route}
            >
              {label}
            </Link>
          ))}
        </div>
      </nav>
      <section
        id="featured"
        className="scroll-mt-24 mx-auto max-w-7xl px-5 py-20 sm:px-7 lg:px-10"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-primary">
              Featured creative spaces
            </p>
            <h2 className="font-display mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
              Big ideas start here.
            </h2>
          </div>
          <Link
            href="#directory"
            className="text-sm font-bold text-primary hover:underline"
          >
            See the full directory →
          </Link>
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {featured.map((tool) => (
            <ToolCard key={tool.id} tool={tool} featured />
          ))}
        </div>
      </section>
      <ToolDirectory operations={operations} />
      <section
        id="comparison"
        className="scroll-mt-24 mx-auto max-w-7xl px-5 py-20 sm:px-7 lg:px-10"
      >
        <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-primary">
          At a glance
        </p>
        <h2 className="font-display mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
          Choose with confidence.
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
          Each tool has its own job, but your creative work can continue across
          the workspace. These are representative workflows, not a promise that
          all provider models support every input.
        </p>
        <div className="mt-8 overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[650px] border-collapse text-left text-sm">
            <thead className="bg-secondary/60">
              <tr>
                {["Tool", "Starting point", "Best for", "Learn more"].map(
                  (heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className="border-b border-border px-5 py-4 text-xs font-bold"
                    >
                      {heading}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {publicTools
                .filter((tool) => tool.id !== "templates")
                .map((tool) => (
                  <tr
                    key={tool.id}
                    className="border-b border-border last:border-0 hover:bg-secondary/30"
                  >
                    <th scope="row" className="px-5 py-4 font-semibold">
                      {tool.title}
                    </th>
                    <td className="px-5 py-4 text-muted-foreground">
                      {tool.workflow[0]}
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">
                      {tool.idealFor}
                    </td>
                    <td className="px-5 py-4">
                      <Link
                        href={toolHref(tool)}
                        className="font-bold text-primary hover:underline"
                      >
                        Explore ↗
                      </Link>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
      <section
        id="workflow"
        className="scroll-mt-24 border-y border-border bg-sidebar/40"
      >
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 sm:px-7 lg:grid-cols-[.82fr_1.18fr] lg:items-center lg:px-10 lg:py-24">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-primary">
              One connected workflow
            </p>
            <h2 className="font-display mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
              From brief to campaign.
            </h2>
            <p className="mt-5 text-sm leading-7 text-muted-foreground">
              The most useful work often involves more than one tool. Develop a
              concept, generate a visual, build motion, add narration and keep
              the result together.
            </p>
            <Link
              href="/pricing"
              className="mt-6 inline-flex text-sm font-bold text-primary hover:underline"
            >
              Understand generation pricing →
            </Link>
          </div>
          <ol className="space-y-3">
            {[
              [
                "creative-director",
                "Shape the direction",
                "Start from a clear creative brief.",
              ],
              [
                "image-studio",
                "Make the campaign visual",
                "Create imagery with model-supported references.",
              ],
              [
                "video-studio",
                "Bring it to life",
                "Explore movement and sequence.",
              ],
              [
                "voice-studio",
                "Give it a voice",
                "Create the accompanying narration.",
              ],
              [
                "mediakit",
                "Prepare for delivery",
                "Use published processing tools when appropriate.",
              ],
            ].map(([id, title, description], index) => {
              const tool = publicTools.find((item) => item.id === id);
              return tool ? (
                <li
                  key={id}
                  className="flex items-center gap-4 rounded-xl border border-border bg-card p-4"
                >
                  <span className="font-hand text-2xl font-bold text-primary">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Icon name={tool.icon} className="size-5" />
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-bold">{title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {description}
                    </p>
                  </div>
                  <Link
                    href={toolHref(tool)}
                    className="shrink-0 text-xs font-bold text-primary hover:underline"
                  >
                    Explore ↗
                  </Link>
                </li>
              ) : null;
            })}
          </ol>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-7 lg:px-10">
        <div className="grid gap-6 rounded-3xl border border-border bg-card p-7 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-primary">
              A faster starting point
            </p>
            <h2 className="font-display mt-2 text-3xl font-semibold">
              Start from an illustrated template.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
              Browse the ready-to-use recipes in your workspace and go directly
              to the corresponding Studio to personalize the result.
            </p>
          </div>
          <Link
            href="/tools/generation-templates"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-5 py-2 text-sm font-bold hover:bg-secondary"
          >
            Explore templates →
          </Link>
        </div>
      </section>
      <section
        id="faq"
        className="scroll-mt-24 mx-auto max-w-4xl px-5 py-16 sm:px-7"
      >
        <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-primary">
          Before you begin
        </p>
        <h2 className="font-display mt-3 text-4xl font-semibold tracking-tight">
          Frequently asked questions.
        </h2>
        <div className="mt-8 overflow-hidden rounded-2xl border border-border bg-card">
          {faqs.map((item) => (
            <details
              key={item.q}
              className="group border-b border-border p-5 last:border-0"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-bold focus-visible:outline-2 focus-visible:outline-ring">
                {item.q}
                <Icon
                  name="chevron"
                  className="size-4 shrink-0 transition group-open:rotate-90"
                />
              </summary>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </section>
      <div className="mx-auto max-w-7xl px-5 pb-20 sm:px-7 lg:px-10">
        <ToolsConversion title="One workspace. More ways to create." />
      </div>
      <ToolsFooter />
    </main>
  );
}
