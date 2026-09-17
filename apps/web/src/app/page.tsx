import { Button } from "@aiwa/ui/button";
import Link from "next/link";

import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Brand } from "@/components/ui/brand";
import { Annotation, CreativeSurface, Eyebrow } from "@/components/ui/creative";
import { Icon, type IconName } from "@/components/ui/icon";
import {
  DemoBadge,
  PencilArrow,
  RuledNote,
  StatusDot,
  Tape,
} from "@/components/ui/sketch";

const formats: readonly {
  name: string;
  description: string;
  detail: string;
  icon: IconName;
  tone: string;
  rotate: string;
}[] = [
  {
    name: "Image",
    description:
      "Campaign visuals, product scenes, edits, and brand-consistent variations.",
    detail: "Seedream models",
    icon: "image",
    tone: "bg-primary/10 text-primary",
    rotate: "lg:-rotate-1",
  },
  {
    name: "Video",
    description:
      "Turn a brief into a storyline, shot plan, and production-ready motion.",
    detail: "Seedance models",
    icon: "video",
    tone: "bg-info/10 text-info",
    rotate: "lg:rotate-1",
  },
  {
    name: "Voice",
    description:
      "Natural multilingual narration for ads, explainers, and social content.",
    detail: "Seed Speech models",
    icon: "voice",
    tone: "bg-warning/10 text-warning",
    rotate: "lg:-rotate-[0.6deg]",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <div className="creative-glow pointer-events-none absolute inset-x-0 top-0 h-[880px]" />
      <div className="paper-grid pointer-events-none absolute inset-x-0 top-0 h-[780px] opacity-55 [mask-image:linear-gradient(to_bottom,black,transparent)]" />

      <header className="relative z-30 mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-4 px-5 sm:px-7 lg:px-10">
        <Brand />
        <nav
          className="hidden items-center gap-1 rounded-full border border-border bg-card/70 p-1 text-xs font-semibold text-muted-foreground shadow-xs backdrop-blur-xl md:flex"
          aria-label="Public navigation"
        >
          {[
            ["#platform", "Creative tools"],
            ["#workflow", "Workflow"],
            ["#operations", "Control"],
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

      <section className="relative mx-auto grid max-w-7xl gap-14 px-5 pb-24 pt-14 sm:px-7 sm:pt-20 lg:grid-cols-[1fr_.92fr] lg:items-center lg:px-10 lg:pb-32 lg:pt-24">
        <div className="page-reveal relative z-10">
          <div>
            <StatusDot tone="primary">Private creative preview</StatusDot>
          </div>
          <h1 className="font-display mt-7 max-w-3xl text-balance text-5xl font-semibold leading-[1.02] tracking-[-0.055em] text-foreground sm:text-6xl lg:text-[76px]">
            Ideas in the rough.
            <span className="text-gradient block">Media in full colour.</span>
          </h1>
          <p className="mt-7 max-w-xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
            Sketch the brief, pick the right AI model, and turn first thoughts
            into polished images, video, and voice—all inside one secure
            workspace.
          </p>
          <div className="mt-9 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <Button asChild size="lg" className="min-w-48">
              <Link href="/sign-up">
                <Icon name="sparkles" className="size-4" /> Open your canvas
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href="/sign-in">View internal demo</Link>
            </Button>
          </div>
          <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] font-medium text-subtle-foreground">
            {["Email access", "Isolated workspaces", "Visible credit cost"].map(
              (item) => (
                <span key={item} className="inline-flex items-center gap-2">
                  <Icon name="check" className="size-3.5 text-success" />
                  {item}
                </span>
              ),
            )}
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-xl pb-12 lg:pb-4">
          <div className="absolute -left-8 top-10 z-20 hidden -rotate-6 sm:block">
            <RuledNote className="w-48 py-4">
              <Tape className="-top-3 left-12" />
              <Annotation className="text-lg text-foreground">
                Begin with a spark,
                <br /> finish with a story.
              </Annotation>
            </RuledNote>
            <PencilArrow className="absolute -bottom-12 left-32 h-14 w-24 rotate-12" />
          </div>
          <CreativeBoard />
          <div className="absolute -bottom-1 right-2 z-20 rotate-2 rounded-xl border border-border bg-card px-4 py-3 shadow-sketch sm:right-8">
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-subtle-foreground">
              From prompt to publish
            </p>
            <p className="font-display mt-1 text-lg font-semibold text-foreground">
              One bright workflow ✦
            </p>
          </div>
        </div>
      </section>

      <section
        id="platform"
        className="relative border-y border-border bg-card/35"
      >
        <div className="paper-dots mx-auto max-w-7xl px-5 py-20 sm:px-7 lg:px-10 lg:py-28">
          <div className="grid gap-8 lg:grid-cols-[.7fr_1.3fr] lg:items-end">
            <div>
              <Eyebrow>Three ways to make</Eyebrow>
              <h2 className="font-display mt-4 text-4xl font-semibold tracking-[-0.045em] text-foreground sm:text-5xl">
                A desk full of creative possibilities.
              </h2>
            </div>
            <p className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base lg:justify-self-end">
              Choose a format, compare models in plain language, see the credit
              estimate, and keep the result attached to the right client and
              project.
            </p>
          </div>

          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {formats.map((format, index) => (
              <CreativeSurface
                as="article"
                variant={index === 1 ? "sketch" : "plain"}
                key={format.name}
                className={`hover-lift group flex min-h-80 flex-col overflow-hidden p-6 ${format.rotate}`}
              >
                <div className="flex items-start justify-between">
                  <span
                    className={`grid size-12 place-items-center rounded-xl ${format.tone}`}
                  >
                    <Icon name={format.icon} />
                  </span>
                  <span className="font-hand text-xl font-semibold text-subtle-foreground">
                    0{index + 1}
                  </span>
                </div>
                <p className="mt-10 font-mono text-[10px] font-bold uppercase tracking-[0.17em] text-subtle-foreground">
                  {format.detail}
                </p>
                <h3 className="font-display mt-2 text-3xl font-semibold tracking-tight text-foreground">
                  {format.name}
                </h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {format.description}
                </p>
                <Link
                  href="/sign-up"
                  className="mt-auto flex items-center gap-2 pt-8 text-xs font-semibold text-foreground"
                >
                  Try {format.name.toLowerCase()}
                  <Icon
                    name="arrow"
                    className="size-4 transition-transform group-hover:translate-x-1"
                  />
                </Link>
              </CreativeSurface>
            ))}
          </div>
        </div>
      </section>

      <section
        id="workflow"
        className="relative mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-7 lg:grid-cols-[.9fr_1.1fr] lg:items-center lg:px-10 lg:py-28"
      >
        <div className="relative order-2 lg:order-1">
          <WorkflowSheet />
        </div>
        <div className="order-1 lg:order-2">
          <Eyebrow className="text-info">A simple creative rhythm</Eyebrow>
          <h2 className="font-display mt-4 text-4xl font-semibold tracking-[-0.045em] text-foreground sm:text-5xl">
            Brief. Shape. Make.
            <span className="sketch-underline"> Keep the magic.</span>
          </h2>
          <p className="mt-5 max-w-xl text-sm leading-7 text-muted-foreground sm:text-base">
            The interface gets out of the way while the important choices stay
            visible: format, model, aspect ratio, expected speed, and credits.
          </p>
          <ol className="mt-8 space-y-5">
            {[
              [
                "01",
                "Describe the idea",
                "Write naturally or add a visual reference.",
              ],
              [
                "02",
                "Choose the craft",
                "Compare the models tuned for your output.",
              ],
              [
                "03",
                "Review before making",
                "See the preview settings and indicative cost.",
              ],
            ].map(([number, title, detail]) => (
              <li key={number} className="flex gap-4">
                <span className="font-hand grid size-10 shrink-0 place-items-center rounded-full border border-primary/25 bg-primary/10 text-lg font-bold text-primary">
                  {number}
                </span>
                <div>
                  <p className="font-display text-base font-semibold text-foreground">
                    {title}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {detail}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="operations" className="border-t border-border bg-sidebar/65">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-7 lg:grid-cols-[.8fr_1.2fr] lg:items-center lg:px-10 lg:py-28">
          <div>
            <Eyebrow className="text-warning">Calm behind the canvas</Eyebrow>
            <h2 className="font-display mt-4 text-4xl font-semibold tracking-[-0.045em] text-foreground sm:text-5xl">
              Creative freedom. Financial control.
            </h2>
            <p className="mt-5 text-sm leading-7 text-muted-foreground sm:text-base">
              A playful studio for creators, backed by a disciplined operations
              console for access, manual OMR payments, credit grants, and model
              health.
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              {["Permission-aware", "Ledger-ready", "Organization-scoped"].map(
                (item) => (
                  <span
                    key={item}
                    className="rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-semibold text-muted-foreground"
                  >
                    {item}
                  </span>
                ),
              )}
            </div>
          </div>
          <FinancePreview />
        </div>
      </section>

      <footer className="border-t border-border bg-background/80">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 px-5 py-8 sm:flex-row sm:px-7 lg:px-10">
          <Brand />
          <p className="text-[11px] text-subtle-foreground">
            Aiwa Media Group · Muscat, Oman · Private platform preview
          </p>
        </div>
      </footer>
    </main>
  );
}

function CreativeBoard() {
  return (
    <div className="paper-sheet sketch-frame relative ml-auto mt-10 min-h-[500px] w-[92%] overflow-hidden rounded-[32px] p-5 sm:p-7 lg:mt-0">
      <div className="paper-grid absolute inset-0 opacity-55" />
      <div className="relative flex items-center justify-between">
        <div>
          <p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-primary">
            Creation canvas
          </p>
          <p className="font-display mt-1 text-xl font-semibold text-foreground">
            Muscat at golden hour
          </p>
        </div>
        <DemoBadge>Concept</DemoBadge>
      </div>
      <div className="relative mt-5 grid grid-cols-3 gap-2 rounded-xl border border-border bg-card/80 p-1.5 shadow-xs backdrop-blur">
        {["Image", "Video", "Voice"].map((label, index) => (
          <span
            key={label}
            className={`rounded-lg px-2 py-2 text-center text-[10px] font-semibold ${index === 0 ? "bg-foreground text-background shadow-sm" : "text-subtle-foreground"}`}
          >
            {label}
          </span>
        ))}
      </div>
      <div className="relative mt-4 rounded-2xl border border-border bg-card/90 p-4 shadow-sm">
        <p className="text-[10px] font-semibold text-muted-foreground">
          Creative prompt
        </p>
        <p className="mt-2 text-xs leading-5 text-foreground/80">
          A premium campaign study inspired by Oman&apos;s coastline, soft
          mineral colours, sculpted light, editorial photography…
        </p>
      </div>
      <div className="relative mt-4 overflow-hidden rounded-[24px] border border-border bg-[linear-gradient(145deg,oklch(0.2_0.03_270),oklch(0.34_0.13_315)_52%,var(--coral))] p-5 shadow-lg">
        <div className="absolute -right-10 -top-10 size-40 rounded-full bg-coral/30 blur-3xl" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[radial-gradient(ellipse_at_bottom,color-mix(in_oklch,var(--coral)_70%,transparent),transparent_68%)]" />
        <div className="relative min-h-48 text-on-vivid">
          <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-on-vivid/65">
            Generated concept
          </p>
          <p className="font-display mt-2 text-3xl font-semibold">
            Coastal light
          </p>
          <div className="absolute bottom-0 left-1/2 h-28 w-16 -translate-x-1/2 rounded-t-[36px] rounded-b-xl border border-on-vivid/20 bg-on-vivid/10 shadow-2xl backdrop-blur-sm" />
          <span className="absolute bottom-0 right-0 rounded-full bg-card/40 px-2.5 py-1 text-[9px] font-semibold backdrop-blur">
            28 credits
          </span>
        </div>
      </div>
    </div>
  );
}

function WorkflowSheet() {
  return (
    <div className="paper-sheet relative rounded-[28px] p-5 sm:p-7">
      <Tape className="-top-3 left-1/2 -translate-x-1/2" />
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <p className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-subtle-foreground">
            Project notebook / 07
          </p>
          <p className="font-display mt-1 text-lg font-semibold text-foreground">
            Launch campaign
          </p>
        </div>
        <StatusDot>Ready</StatusDot>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {["Moodboard", "Hero visual", "Launch film", "Arabic narration"].map(
          (item, index) => (
            <div
              key={item}
              className={`rounded-2xl border border-border p-4 ${index === 1 ? "bg-primary/10" : "bg-surface-sunken/75"}`}
            >
              <span className="font-hand text-lg font-semibold text-primary">
                0{index + 1}
              </span>
              <p className="mt-4 text-sm font-semibold text-foreground">
                {item}
              </p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-foreground/[0.07]">
                <div
                  className="h-full rounded-full bg-[var(--gradient-spectrum)]"
                  style={{ width: `${[100, 82, 58, 34][index]}%` }}
                />
              </div>
            </div>
          ),
        )}
      </div>
      <Annotation className="mt-5 text-lg text-muted-foreground">
        Every asset stays with its project →
      </Annotation>
    </div>
  );
}

function FinancePreview() {
  const values = [36, 54, 44, 70, 60, 84, 68, 94, 76, 88, 70, 92];
  return (
    <CreativeSurface className="relative overflow-hidden rounded-[28px] p-5 shadow-md sm:p-7">
      <div className="absolute -right-20 -top-20 size-56 rounded-full bg-info/10 blur-3xl" />
      <div className="relative flex items-center justify-between gap-4">
        <div>
          <p className="font-display text-lg font-semibold text-foreground">
            Finance overview
          </p>
          <p className="mt-1 text-xs text-subtle-foreground">September 2026</p>
        </div>
        <DemoBadge>Illustrative data</DemoBadge>
      </div>
      <div className="relative mt-6 grid gap-3 sm:grid-cols-3">
        {[
          ["Credits issued", "48,200"],
          ["Credits used", "31,480"],
          ["Pending OMR", "275.000"],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border border-border bg-background/55 p-4"
          >
            <p className="text-[10px] text-subtle-foreground">{label}</p>
            <p className="font-display mt-2 text-xl font-semibold text-foreground">
              {value}
            </p>
          </div>
        ))}
      </div>
      <div className="relative mt-4 rounded-2xl border border-border bg-surface-sunken p-4">
        <div className="flex h-40 items-end justify-between gap-2">
          {values.map((height, index) => (
            <div
              key={`${height}-${index}`}
              className="flex h-full flex-1 items-end"
            >
              <span
                className="w-full rounded-t bg-gradient-to-t from-primary/45 to-info/80"
                style={{ height: `${height}%` }}
              />
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-between font-mono text-[8px] uppercase tracking-wider text-subtle-foreground">
          <span>Week 1</span>
          <span>Week 2</span>
          <span>Week 3</span>
          <span>Week 4</span>
        </div>
      </div>
    </CreativeSurface>
  );
}
