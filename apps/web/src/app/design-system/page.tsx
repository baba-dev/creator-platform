import type { Metadata } from "next";
import Link from "next/link";

import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { Annotation, CreativeSurface, Eyebrow } from "@/components/ui/creative";
import { Icon } from "@/components/ui/icon";

export const metadata: Metadata = {
  title: "Design system",
  description: "Pencil & Pixel visual language for Aiwa Creators.",
};

const swatches = [
  {
    token: "primary",
    use: "Primary action · violet pencil",
    className: "bg-primary",
  },
  {
    token: "accent",
    use: "Emphasis · coral marker",
    className: "bg-accent",
  },
  {
    token: "info",
    use: "Video and information",
    className: "bg-info",
  },
  {
    token: "success",
    use: "Ready and completed",
    className: "bg-success",
  },
  {
    token: "warning",
    use: "Pending and review",
    className: "bg-warning",
  },
  {
    token: "destructive",
    use: "Failure and irreversible action",
    className: "bg-destructive",
  },
] as const;

const rules = [
  [
    "One focal mark",
    "Use one sketch gesture per major viewport, not everywhere.",
  ],
  [
    "Semantic first",
    "Use purpose tokens; never choose a fixed color for product UI.",
  ],
  [
    "Calm canvas",
    "Most surfaces stay neutral so generated media remains the hero.",
  ],
  [
    "Motion explains",
    "Animate state, hierarchy, or causality—never decorate waiting.",
  ],
] as const;

export default function DesignSystemPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <div className="paper-grid pointer-events-none fixed inset-0 opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent_80%)]" />

      <header className="relative z-20 mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-7 lg:px-10">
        <Link
          href="/"
          className="font-display text-sm font-bold tracking-[0.1em]"
        >
          AIWA CREATORS
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground sm:block">
            Pencil &amp; Pixel · v1.0
          </span>
          <ThemeToggle />
        </div>
      </header>

      <section className="relative mx-auto max-w-7xl px-5 pb-20 pt-14 sm:px-7 sm:pt-20 lg:px-10">
        <div className="max-w-4xl animate-reveal">
          <Eyebrow>Definitive visual language</Eyebrow>
          <h1 className="font-display mt-5 text-balance text-5xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-7xl lg:text-[88px]">
            Ideas begin in <span className="sketch-underline">pencil.</span>
            <span className="text-gradient block">AI brings them to life.</span>
          </h1>
          <p className="mt-7 max-w-2xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
            A warm, tactile canvas for serious creative work—graphite structure,
            vivid maker marks, and motion that feels drawn rather than dropped
            into place.
          </p>
          <Annotation className="mt-6">made for imaginative work ↗</Annotation>
        </div>

        <div className="mt-16 grid gap-4 lg:grid-cols-[1.25fr_.75fr]">
          <CreativeSurface
            variant="sketch"
            className="relative min-h-80 overflow-hidden p-6 sm:p-8"
          >
            <div className="creative-glow absolute inset-0 opacity-90" />
            <div className="paper-dots absolute inset-0 opacity-40" />
            <div className="relative flex h-full flex-col justify-between">
              <div className="flex items-start justify-between">
                <span className="grid size-12 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                  <Icon name="sparkles" />
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  Creative canvas 01
                </span>
              </div>
              <div>
                <p className="font-display max-w-xl text-3xl font-semibold tracking-[-0.035em] sm:text-5xl">
                  Structured enough to trust.
                  <br />
                  <span className="text-primary">
                    Expressive enough to love.
                  </span>
                </p>
              </div>
            </div>
          </CreativeSurface>

          <CreativeSurface className="flex min-h-80 flex-col p-6 sm:p-8">
            <Eyebrow>Character balance</Eyebrow>
            <div className="my-auto space-y-5">
              {[
                ["70%", "Calm product foundation"],
                ["20%", "Vivid creative color"],
                ["10%", "Sketch personality"],
              ].map(([value, label], index) => (
                <div key={label}>
                  <div className="flex items-end justify-between gap-4">
                    <span className="font-display text-3xl font-semibold">
                      {value}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {label}
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={[
                        "h-full rounded-full",
                        index === 0
                          ? "w-[70%] bg-foreground"
                          : index === 1
                            ? "w-[20%] bg-primary"
                            : "w-[10%] bg-accent",
                      ].join(" ")}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CreativeSurface>
        </div>
      </section>

      <section className="relative border-y border-border bg-card/45">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-7 lg:px-10">
          <SectionIntro
            number="01"
            eyebrow="Color system"
            title="Purpose before pigment."
            description="Every color has a job in both modes. The same semantic token changes value—not meaning."
          />

          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {swatches.map((swatch) => (
              <CreativeSurface
                key={swatch.token}
                className="group overflow-hidden p-3 transition duration-300 hover:-translate-y-1 hover:shadow-md"
              >
                <div
                  className={`h-28 rounded-lg ${swatch.className} transition-transform duration-500 ease-creative group-hover:scale-[1.02]`}
                />
                <div className="flex items-start justify-between gap-4 px-1 pb-1 pt-4">
                  <div>
                    <p className="font-mono text-xs font-bold">
                      --{swatch.token}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {swatch.use}
                    </p>
                  </div>
                  <span className="text-[10px] text-subtle-foreground">
                    Light + Dark
                  </span>
                </div>
              </CreativeSurface>
            ))}
          </div>
        </div>
      </section>

      <section className="relative mx-auto max-w-7xl px-5 py-20 sm:px-7 lg:px-10">
        <SectionIntro
          number="02"
          eyebrow="Typography"
          title="Editorial voice, product clarity."
          description="Bricolage Grotesque carries ideas, Manrope carries work, and Caveat is reserved for human annotations."
        />

        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          <CreativeSurface className="p-6 sm:p-8">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Display · Bricolage Grotesque
            </span>
            <p className="font-display mt-8 text-5xl font-semibold leading-none tracking-[-0.05em] sm:text-7xl">
              Make ideas visible.
            </p>
            <p className="mt-8 max-w-md text-sm leading-6 text-muted-foreground">
              Use display type for H1–H3 and campaign moments. Keep tracking
              tight and line-height compact; never use it for dense controls.
            </p>
          </CreativeSurface>

          <div className="grid gap-4">
            <CreativeSurface className="p-6">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Body · Manrope
              </span>
              <p className="mt-5 text-lg font-semibold">
                Clear at every working size
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Interface copy, paragraphs, labels, controls, and data stay
                neutral and highly legible.
              </p>
            </CreativeSurface>
            <CreativeSurface variant="sunken" className="p-6">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Annotation · Caveat
              </span>
              <p className="font-hand mt-3 -rotate-1 text-4xl font-semibold text-primary">
                Try another direction →
              </p>
            </CreativeSurface>
          </div>
        </div>
      </section>

      <section className="relative border-y border-border bg-card/45">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-7 lg:px-10">
          <SectionIntro
            number="03"
            eyebrow="Components"
            title="Tactile, not toy-like."
            description="Soft paper surfaces and hand-made edges add character while controls remain predictable and accessible."
          />

          <div className="mt-10 grid gap-4 lg:grid-cols-[.8fr_1.2fr]">
            <CreativeSurface className="p-6">
              <p className="text-sm font-semibold">Actions</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button>
                  <Icon name="sparkles" className="size-4" /> Generate
                </Button>
                <Button variant="secondary">Save draft</Button>
                <Button variant="ghost">Cancel</Button>
              </div>
              <div className="mt-8">
                <label
                  htmlFor="design-system-prompt"
                  className="text-sm font-semibold"
                >
                  Creative prompt
                </label>
                <textarea
                  id="design-system-prompt"
                  className="mt-2 min-h-28 w-full resize-none rounded-md border border-input bg-background/65 px-4 py-3 text-sm leading-6 outline-none transition focus:border-primary/55 focus:ring-4 focus:ring-primary/10"
                  defaultValue="A cinematic launch visual sketched in graphite, then blooming into vivid color…"
                />
              </div>
            </CreativeSurface>

            <CreativeSurface variant="sketch" className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-6 py-4">
                <div>
                  <p className="text-sm font-semibold">Campaign concept</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Muscat fragrance launch
                  </p>
                </div>
                <span className="rounded-full border border-success/20 bg-success/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-success">
                  Ready
                </span>
              </div>
              <div className="grid min-h-64 sm:grid-cols-[1fr_.7fr]">
                <div className="paper-grid relative overflow-hidden bg-surface-sunken p-6">
                  <div className="absolute left-[18%] top-[20%] size-36 animate-float rounded-full bg-primary/20 blur-3xl" />
                  <div className="absolute bottom-[12%] right-[12%] size-32 animate-pulse-soft rounded-full bg-coral/25 blur-3xl" />
                  <div className="relative grid h-full place-items-center">
                    <div className="grid size-28 place-items-center rounded-[38%_62%_48%_52%/55%_42%_58%_45%] border border-primary/30 bg-card/70 text-primary shadow-lg backdrop-blur">
                      <Icon name="image" className="size-8" />
                    </div>
                  </div>
                </div>
                <div className="flex flex-col justify-between p-6">
                  <div>
                    <Eyebrow>Seedream</Eyebrow>
                    <p className="font-display mt-3 text-2xl font-semibold">
                      Desert bloom
                    </p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      Editorial light, crafted shadows, warm material detail.
                    </p>
                  </div>
                  <p className="font-mono mt-6 text-[10px] text-subtle-foreground">
                    1:1 · 2048px · 28 credits
                  </p>
                </div>
              </div>
            </CreativeSurface>
          </div>
        </div>
      </section>

      <section className="relative mx-auto max-w-7xl px-5 py-20 sm:px-7 lg:px-10">
        <SectionIntro
          number="04"
          eyebrow="Rules for every page"
          title="A system creative teams can trust."
          description="These constraints keep AI-generated pages recognizably Aiwa Creators instead of becoming a collection of trends."
        />
        <div className="mt-10 grid gap-3 md:grid-cols-2">
          {rules.map(([title, description], index) => (
            <CreativeSurface
              key={title}
              className="flex gap-5 p-5 transition duration-300 hover:-translate-y-0.5 hover:border-primary/30"
            >
              <span className="font-hand text-3xl font-semibold text-primary">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <p className="font-display text-lg font-semibold">{title}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {description}
                </p>
              </div>
            </CreativeSurface>
          ))}
        </div>
      </section>

      <footer className="border-t border-border bg-card/45">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-7 lg:px-10">
          <p>Aiwa Creators · Pencil &amp; Pixel design system</p>
          <Link href="/" className="font-semibold text-primary hover:underline">
            Return to platform
          </Link>
        </div>
      </footer>
    </main>
  );
}

function SectionIntro({
  number,
  eyebrow,
  title,
  description,
}: {
  number: string;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[110px_1fr_1fr] lg:items-end">
      <span className="font-hand text-5xl font-semibold text-primary/60">
        {number}
      </span>
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="font-display mt-3 text-3xl font-semibold tracking-[-0.035em] sm:text-5xl">
          {title}
        </h2>
      </div>
      <p className="max-w-xl text-sm leading-6 text-muted-foreground lg:justify-self-end">
        {description}
      </p>
    </div>
  );
}
