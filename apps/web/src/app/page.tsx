import { Button } from "@aiwa/ui/button";
import type { Metadata } from "next";
import Link from "next/link";

import {
  LandingFeatureExplorer,
  LandingStudioExperience,
} from "@/components/marketing/landing-experience";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Brand } from "@/components/ui/brand";
import { Annotation, CreativeSurface, Eyebrow } from "@/components/ui/creative";
import { Icon, type IconName } from "@/components/ui/icon";
import {
  PencilArrow,
  RuledNote,
  StatusDot,
  Tape,
} from "@/components/ui/sketch";
import { reasoningProviders } from "@/lib/landing-content";

export const metadata: Metadata = {
  title: "AI Creative Studio for Image, Video, Voice & Campaign Workflows",
  description:
    "Create images, video, voice, AI spokesperson content, scripts, storyboards, brand workflows, and reusable campaign assets in one AI creative workspace.",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title:
      "Aiwa Creators · One AI workspace for the complete creative workflow",
    description:
      "From first brief to generated media, editing, assets, projects, storage, and team controls.",
    type: "website",
  },
};

const workflowSteps: readonly {
  number: string;
  title: string;
  description: string;
  icon: IconName;
}[] = [
  {
    number: "01",
    title: "Start with intent",
    description:
      "Use Quick Create, a focused studio, or an existing conversation. Add source images, video, audio, or project context when the workflow supports them.",
    icon: "sparkles",
  },
  {
    number: "02",
    title: "Shape the direction",
    description:
      "Ask Pixel, enhance the prompt, build a storyboard, write the script, or develop the story before spending credits on media generation.",
    icon: "director",
  },
  {
    number: "03",
    title: "Choose the right model",
    description:
      "Compare enabled models by capability, references, resolution, speed profile, and the credit quote shown before submission.",
    icon: "wand",
  },
  {
    number: "04",
    title: "Generate and refine",
    description:
      "Create image, video, speech, or spokesperson output, then crop, transform, retouch, extend, trim, reorder, or reuse media as the next input.",
    icon: "edit",
  },
  {
    number: "05",
    title: "Keep the work connected",
    description:
      "Assets retain generation provenance and stay organized through projects, history, templates, conversations, storage pools, and team permissions.",
    icon: "projects",
  },
];

const platformPillars: readonly {
  icon: IconName;
  eyebrow: string;
  title: string;
  description: string;
  bullets: readonly string[];
}[] = [
  {
    icon: "chat",
    eyebrow: "Context",
    title: "Pixel stays close to the work.",
    description:
      "The assistant is designed to understand the application, continue creative context, and turn short follow-ups into useful actions instead of isolated one-shot prompts.",
    bullets: [
      "Conversation continuity",
      "App-aware navigation",
      "Prompt and parameter follow-ups",
      "Private workspace context",
    ],
  },
  {
    icon: "assets",
    eyebrow: "Media",
    title: "Your generations become durable assets.",
    description:
      "Generated and uploaded media live in an organization-scoped library with provenance, projects, favourites, folders, tags, and recoverable trash.",
    bullets: [
      "Asset Library",
      "Projects",
      "Generation history",
      "Reusable source media",
    ],
  },
  {
    icon: "upload",
    eyebrow: "Storage",
    title: "Choose where originals live.",
    description:
      "Use platform storage or connect supported cloud pools. Capacity, active-provider state, and organization limits remain visible inside the product.",
    bullets: [
      "Platform storage",
      "Google Drive",
      "OneDrive",
      "Per-pool usage visibility",
    ],
  },
  {
    icon: "credits",
    eyebrow: "Control",
    title: "Creative freedom with accountable spend.",
    description:
      "Quotes, reservations, wallet history, payment records, model pricing, usage limits, and administrative operations keep the creative layer commercially manageable.",
    bullets: [
      "Pre-generation quotes",
      "Immutable credit ledger",
      "OMR cash & cheque payments",
      "Role-aware administration",
    ],
  },
];

const conversationExamples = [
  "Use the second image.",
  "Make it 9:16.",
  "Try another model.",
  "Animate this.",
  "Give me four variations.",
  "Make the voice slower.",
  "Use this generated image as the first frame.",
] as const;

const faq = [
  {
    question: "Is this only an image generator?",
    answer:
      "No. Creators combines image, video, voice, AI spokesperson generation, creative reasoning, script and story workspaces, editing, templates, assets, projects, conversations, storage, and organization controls.",
  },
  {
    question: "Does the public homepage submit real generations?",
    answer:
      "No. The interactive modules on this page are product tours. Real provider work starts only inside an authenticated organization after the application validates the request and shows the applicable quote.",
  },
  {
    question: "Can teams choose different AI models?",
    answer:
      "Yes. Enabled models are discovered by task and capability. Media generation is backed by BytePlus models, while text and reasoning workflows can use enabled BytePlus, NVIDIA, Groq, Gemini, and Cloudflare providers.",
  },
  {
    question: "How are generated files organized?",
    answer:
      "Media is stored as durable assets with generation provenance. Teams can work with projects, history, favourites, folders, tags, templates, conversation context, and supported platform or bring-your-own storage pools.",
  },
] as const;

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <div className="creative-glow pointer-events-none absolute inset-x-0 top-0 h-[980px]" />
      <div className="paper-grid pointer-events-none absolute inset-x-0 top-0 h-[900px] opacity-50 [mask-image:linear-gradient(to_bottom,black,transparent)]" />

      <header className="relative z-30 mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-4 px-5 sm:px-7 lg:px-10">
        <Brand />
        <nav
          className="hidden items-center gap-1 rounded-full border border-border bg-card/70 p-1 text-xs font-semibold text-muted-foreground shadow-xs backdrop-blur-xl lg:flex"
          aria-label="Public navigation"
        >
          {[
            ["#platform", "Platform"],
            ["#models", "Models"],
            ["#workflow", "Workflow"],
            ["#teams", "For teams"],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="rounded-full px-4 py-2 transition hover:bg-secondary hover:text-foreground"
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="hidden sm:inline-flex"
          >
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/sign-up">
              Start creating <Icon name="arrow" className="size-4" />
            </Link>
          </Button>
        </div>
      </header>

      <section className="relative mx-auto grid max-w-7xl gap-12 px-5 pb-20 pt-12 sm:px-7 sm:pt-16 lg:grid-cols-[.82fr_1.18fr] lg:items-center lg:px-10 lg:pb-28 lg:pt-20">
        <div className="page-reveal relative z-10">
          <StatusDot tone="primary">AI creative production workspace</StatusDot>
          <h1 className="font-display mt-7 max-w-3xl text-balance text-5xl font-semibold leading-[1] tracking-[-0.055em] text-foreground sm:text-6xl lg:text-[72px]">
            From first thought
            <span className="text-gradient block">to final media.</span>
          </h1>
          <p className="mt-7 max-w-2xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
            Create images, video, voice, spokesperson content, scripts,
            storyboards, and campaign systems in one workspace—then edit,
            organize, store, and manage the work without breaking the creative
            thread.
          </p>
          <div className="mt-9 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <Button asChild size="lg" className="min-w-48">
              <Link href="/sign-up">
                <Icon name="sparkles" className="size-4" />
                Open your workspace
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <a href="#platform">Explore the platform</a>
            </Button>
          </div>
          <div className="mt-7 grid max-w-xl grid-cols-2 gap-x-5 gap-y-3 text-[11px] font-semibold text-muted-foreground sm:flex sm:flex-wrap">
            {[
              "Multi-model studios",
              "Reference workflows",
              "Projects & assets",
              "Team credit controls",
            ].map((item) => (
              <span key={item} className="inline-flex items-center gap-2">
                <Icon name="check" className="size-3.5 text-success" />
                {item}
              </span>
            ))}
          </div>

          <div className="relative mt-9 hidden max-w-md sm:block">
            <RuledNote className="py-4">
              <Tape className="-top-3 left-10" />
              <Annotation className="text-lg text-foreground">
                Generate less blindly. Direct more intentionally.
              </Annotation>
            </RuledNote>
            <PencilArrow className="absolute -right-20 -top-2 h-16 w-28 rotate-[-8deg]" />
          </div>
        </div>

        <div className="relative z-10">
          <LandingStudioExperience />
        </div>
      </section>

      <section className="relative border-y border-border bg-card/35">
        <div className="mx-auto grid max-w-7xl gap-3 px-5 py-5 text-center sm:grid-cols-2 sm:px-7 lg:grid-cols-4 lg:px-10">
          {[
            ["Image", "Generate · edit · reference"],
            ["Video", "Create · extend · assemble"],
            ["Audio", "Synthesize · cast · converse"],
            ["Creative AI", "Direct · write · plan · enhance"],
          ].map(([title, detail]) => (
            <div
              key={title}
              className="rounded-xl border border-border/70 bg-background/45 px-4 py-4"
            >
              <p className="font-display text-sm font-semibold text-foreground">
                {title}
              </p>
              <p className="mt-1 text-[10px] text-subtle-foreground">
                {detail}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section
        id="platform"
        className="relative mx-auto max-w-7xl px-5 py-20 sm:px-7 lg:px-10 lg:py-28"
      >
        <div className="grid gap-8 lg:grid-cols-[.82fr_1.18fr] lg:items-end">
          <div>
            <Eyebrow>The whole creative stack</Eyebrow>
            <h2 className="font-display mt-4 text-balance text-4xl font-semibold tracking-[-0.045em] text-foreground sm:text-5xl">
              Not a model playground.
              <span className="block text-primary">
                A production workspace.
              </span>
            </h2>
          </div>
          <p className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base lg:justify-self-end">
            The product connects creation, reasoning, editing, organization,
            storage, conversation, and operations so teams can move from an idea
            to a reusable body of campaign work without rebuilding context in
            separate tools.
          </p>
        </div>

        <LandingFeatureExplorer />
      </section>

      <section id="models" className="border-y border-border bg-sidebar/55">
        <div className="paper-dots mx-auto max-w-7xl px-5 py-20 sm:px-7 lg:px-10 lg:py-28">
          <div className="grid gap-10 lg:grid-cols-[.86fr_1.14fr] lg:items-center">
            <div>
              <Eyebrow className="text-info">
                Model choice without model chaos
              </Eyebrow>
              <h2 className="font-display mt-4 text-4xl font-semibold tracking-[-0.045em] text-foreground sm:text-5xl">
                Pick by capability.
                <span className="sketch-underline"> Keep the workflow.</span>
              </h2>
              <p className="mt-5 max-w-xl text-sm leading-7 text-muted-foreground sm:text-base">
                Creators discovers enabled models for the task, keeps provider
                provenance visible, and presents the generation controls that
                model actually supports. Your project structure does not change
                just because the model does.
              </p>
              <div className="mt-7 flex flex-wrap gap-2">
                {[
                  "Aspect-ratio aware",
                  "Reference aware",
                  "Resolution aware",
                  "Provider provenance",
                  "Quote before submission",
                ].map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-border bg-card px-3 py-1.5 text-[10px] font-semibold text-muted-foreground"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <CreativeSurface
              variant="sketch"
              className="relative overflow-hidden p-5 sm:p-7"
            >
              <div className="creative-glow absolute inset-0 opacity-65" />
              <div className="relative">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
                  Enabled provider layer
                </p>
                <h3 className="font-display mt-3 text-2xl font-semibold text-foreground">
                  Media generation + creative reasoning
                </h3>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border bg-card/80 p-5">
                    <p className="text-xs font-semibold text-foreground">
                      Media generation
                    </p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      BytePlus-backed Seedream, Seedance, Seed Speech, and
                      OmniHuman workflows power the customer-facing media
                      studios.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {[
                        "Seedream 5",
                        "Seedance 2",
                        "Seed Speech 2",
                        "OmniHuman 1.5",
                      ].map((item) => (
                        <span
                          key={item}
                          className="rounded-full bg-primary/10 px-2.5 py-1 text-[9px] font-semibold text-primary"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border bg-card/80 p-5">
                    <p className="text-xs font-semibold text-foreground">
                      Text & reasoning
                    </p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      Creative assistance can resolve across enabled reasoning
                      providers while preserving one-model-per-job provenance.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {reasoningProviders.map((provider) => (
                        <span
                          key={provider}
                          className="rounded-full bg-info/10 px-2.5 py-1 text-[9px] font-semibold text-info"
                        >
                          {provider}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </CreativeSurface>
          </div>
        </div>
      </section>

      <section
        id="workflow"
        className="relative mx-auto max-w-7xl px-5 py-20 sm:px-7 lg:px-10 lg:py-28"
      >
        <div className="grid gap-10 lg:grid-cols-[.72fr_1.28fr]">
          <div>
            <Eyebrow className="text-warning">One connected journey</Eyebrow>
            <h2 className="font-display mt-4 text-4xl font-semibold tracking-[-0.045em] text-foreground sm:text-5xl">
              Work conversationally.
              <span className="block text-warning">Ship structurally.</span>
            </h2>
            <p className="mt-5 text-sm leading-7 text-muted-foreground sm:text-base">
              The workspace is built around the reality that creative direction
              changes after the first output. Short follow-ups should continue
              the work instead of forcing a new form every time.
            </p>
            <div className="mt-7 flex flex-wrap gap-2">
              {conversationExamples.map((example) => (
                <span
                  key={example}
                  className="rounded-2xl rounded-bl-md border border-border bg-card px-3 py-2 text-[10px] font-medium text-muted-foreground shadow-xs"
                >
                  “{example}”
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {workflowSteps.map((step) => (
              <CreativeSurface
                key={step.number}
                className="grid gap-4 p-5 sm:grid-cols-[auto_1fr_auto] sm:items-center"
              >
                <span className="font-hand grid size-12 place-items-center rounded-full border border-primary/25 bg-primary/10 text-xl font-bold text-primary">
                  {step.number}
                </span>
                <div>
                  <h3 className="font-display text-lg font-semibold text-foreground">
                    {step.title}
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {step.description}
                  </p>
                </div>
                <span className="hidden size-10 place-items-center rounded-xl border border-border bg-surface-sunken text-muted-foreground sm:grid">
                  <Icon name={step.icon} className="size-4" />
                </span>
              </CreativeSurface>
            ))}
          </div>
        </div>
      </section>

      <section id="teams" className="border-y border-border bg-card/35">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-7 lg:px-10 lg:py-28">
          <div className="max-w-3xl">
            <Eyebrow>Built for real teams</Eyebrow>
            <h2 className="font-display mt-4 text-4xl font-semibold tracking-[-0.045em] text-foreground sm:text-5xl">
              Creativity on top.
              <span className="text-gradient block">
                Production discipline underneath.
              </span>
            </h2>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {platformPillars.map((pillar, index) => (
              <CreativeSurface
                key={pillar.title}
                variant={index === 0 ? "sketch" : "plain"}
                className="p-6 sm:p-7"
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="grid size-11 place-items-center rounded-xl border border-border bg-background/65 text-primary">
                    <Icon name={pillar.icon} className="size-5" />
                  </span>
                  <span className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-subtle-foreground">
                    {pillar.eyebrow}
                  </span>
                </div>
                <h3 className="font-display mt-6 text-2xl font-semibold tracking-[-0.03em] text-foreground">
                  {pillar.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {pillar.description}
                </p>
                <ul className="mt-5 grid gap-2 sm:grid-cols-2">
                  {pillar.bullets.map((bullet) => (
                    <li
                      key={bullet}
                      className="flex items-center gap-2 text-[10px] font-semibold text-muted-foreground"
                    >
                      <Icon name="check" className="size-3.5 text-success" />
                      {bullet}
                    </li>
                  ))}
                </ul>
              </CreativeSurface>
            ))}
          </div>
        </div>
      </section>

      <section className="relative mx-auto max-w-7xl px-5 py-20 sm:px-7 lg:px-10 lg:py-28">
        <CreativeSurface
          variant="sketch"
          className="relative overflow-hidden rounded-[32px] p-7 sm:p-10 lg:p-12"
        >
          <div className="creative-glow pointer-events-none absolute inset-0 opacity-75" />
          <div className="paper-grid pointer-events-none absolute inset-0 opacity-25" />
          <div className="relative grid gap-10 lg:grid-cols-[1fr_.72fr] lg:items-end">
            <div>
              <Eyebrow>Ready when the brief is</Eyebrow>
              <h2 className="font-display mt-4 max-w-3xl text-balance text-4xl font-semibold tracking-[-0.045em] text-foreground sm:text-6xl">
                Give the team one place to think, make, refine, and deliver.
              </h2>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
                Start with Quick Create, move into specialized studios when you
                need control, and keep the resulting media connected to the
                project instead of scattered across isolated AI tools.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
              <Button asChild size="lg">
                <Link href="/sign-up">
                  <Icon name="sparkles" className="size-4" />
                  Start creating
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href="/sign-in">Sign in</Link>
              </Button>
            </div>
          </div>
        </CreativeSurface>
      </section>

      <section className="border-t border-border bg-sidebar/50">
        <div className="mx-auto max-w-5xl px-5 py-20 sm:px-7 lg:px-10">
          <div className="text-center">
            <Eyebrow>Questions before you create</Eyebrow>
            <h2 className="font-display mt-4 text-3xl font-semibold tracking-[-0.04em] text-foreground sm:text-4xl">
              The short version.
            </h2>
          </div>
          <div className="mt-10 grid gap-3">
            {faq.map((item) => (
              <details
                key={item.question}
                className="group rounded-2xl border border-border bg-card/75 p-5 shadow-xs"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-foreground">
                  {item.question}
                  <span className="grid size-7 shrink-0 place-items-center rounded-full border border-border bg-background text-muted-foreground transition group-open:rotate-90">
                    <Icon name="chevron" className="size-3.5" />
                  </span>
                </summary>
                <p className="mt-4 max-w-3xl text-xs leading-6 text-muted-foreground">
                  {item.answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border bg-background/90">
        <div className="mx-auto grid max-w-7xl gap-6 px-5 py-9 sm:px-7 md:grid-cols-[1fr_auto] md:items-center lg:px-10">
          <div>
            <Brand />
            <p className="mt-3 max-w-lg text-[11px] leading-5 text-subtle-foreground">
              Aiwa Creators · AI-assisted creative production for image, video,
              voice, storytelling, assets, and team workflows.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-muted-foreground">
            <Link
              href="/privacy-policy"
              className="transition hover:text-foreground"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms-of-service"
              className="transition hover:text-foreground"
            >
              Terms of Service
            </Link>
            <Link href="/sign-in" className="transition hover:text-foreground">
              Sign In
            </Link>
            <Link
              href="/sign-up"
              className="font-semibold text-primary hover:underline"
            >
              Start creating
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
