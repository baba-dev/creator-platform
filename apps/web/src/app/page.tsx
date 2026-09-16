import { Button } from "@aiwa/ui/button";
import Link from "next/link";

import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Brand } from "@/components/ui/brand";
import { Icon, type IconName } from "@/components/ui/icon";

const formats: readonly {
  name: string;
  description: string;
  detail: string;
  icon: IconName;
  tone: string;
}[] = [
  {
    name: "Image",
    description:
      "Campaign visuals, product scenes, edits, and brand-consistent variations.",
    detail: "Powered by Seedream",
    icon: "image",
    tone: "from-primary/20 to-primary/5 text-primary",
  },
  {
    name: "Video",
    description:
      "Turn a brief into a storyline, shot plan, and production-ready motion.",
    detail: "Powered by Seedance",
    icon: "video",
    tone: "from-info/20 to-info/5 text-info",
  },
  {
    name: "Voice",
    description:
      "Natural multilingual narration for ads, explainers, and social content.",
    detail: "Powered by Seed Speech",
    icon: "voice",
    tone: "from-warning/20 to-warning/5 text-warning",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <div className="creative-glow pointer-events-none absolute inset-x-0 top-0 h-[760px]" />
      <div className="paper-grid pointer-events-none absolute inset-x-0 top-0 h-[700px] opacity-45 [mask-image:linear-gradient(to_bottom,black,transparent)]" />

      <header className="relative z-20 mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-7 lg:px-10">
        <Brand />
        <nav
          className="hidden items-center gap-7 text-xs font-medium text-muted-foreground md:flex"
          aria-label="Public navigation"
        >
          <a href="#platform" className="transition hover:text-foreground">
            Platform
          </a>
          <a href="#models" className="transition hover:text-foreground">
            Models
          </a>
          <a href="#operations" className="transition hover:text-foreground">
            Operations
          </a>
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

      <section className="relative mx-auto max-w-7xl px-5 pb-20 pt-16 text-center sm:px-7 sm:pt-24 lg:px-10">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/[0.07] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-success" />
          </span>
          Private preview · Aiwa Media Group
        </div>
        <h1 className="font-display mx-auto mt-7 max-w-5xl text-balance text-5xl font-semibold leading-[1.03] tracking-[-0.055em] text-foreground sm:text-6xl lg:text-[78px]">
          Your entire creative team,
          <span className="text-gradient block">powered by AI.</span>
        </h1>
        <p className="mx-auto mt-7 max-w-2xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
          Create professional images, videos, and voices in one secure
          workspace—with clear pricing, team controls, and every credit
          accounted for.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg" className="min-w-44">
            <Link href="/sign-up">
              <Icon name="sparkles" className="size-4" /> Open your workspace
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary" className="min-w-40">
            <Link href="/sign-in">View internal demo</Link>
          </Button>
        </div>
        <p className="mt-4 text-[11px] text-subtle-foreground">
          Email access only · Organization-isolated · Admin-controlled credits
        </p>

        <ProductPreview />
      </section>

      <section
        id="platform"
        className="relative border-y border-border bg-foreground/[0.018]"
      >
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-7 lg:px-10 lg:py-28">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-primary">
              One creative platform
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-foreground sm:text-5xl">
              From first thought to finished media.
            </h2>
            <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">
              Choose the format, compare the right models, see the credit price,
              and keep every result organized by client and project.
            </p>
          </div>
          <div id="models" className="mt-12 grid gap-4 lg:grid-cols-3">
            {formats.map((format) => (
              <article
                key={format.name}
                className="group relative min-h-72 overflow-hidden rounded-[28px] border border-border bg-card p-6 transition duration-300 hover:-translate-y-1 hover:border-border"
              >
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${format.tone} opacity-60 transition group-hover:opacity-100`}
                />
                <div className="relative flex h-full flex-col">
                  <span className="grid size-12 place-items-center rounded-2xl border border-border bg-surface-sunken">
                    <Icon name={format.icon} />
                  </span>
                  <p className="mt-10 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                    {format.detail}
                  </p>
                  <h3 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                    {format.name}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {format.description}
                  </p>
                  <Link
                    href="/sign-up"
                    className="mt-auto flex items-center gap-2 pt-7 text-xs font-semibold text-foreground"
                  >
                    Explore {format.name.toLowerCase()}{" "}
                    <Icon
                      name="arrow"
                      className="size-4 transition group-hover:translate-x-1"
                    />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        id="operations"
        className="relative mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-7 lg:grid-cols-[.85fr_1.15fr] lg:items-center lg:px-10 lg:py-28"
      >
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-info">
            Built for business
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-foreground sm:text-5xl">
            Creative freedom. Financial control.
          </h2>
          <p className="mt-5 text-sm leading-7 text-muted-foreground sm:text-base">
            A customer-friendly studio on the front. An operations and finance
            system behind it—designed around the way Aiwa collects payments in
            Oman.
          </p>
          <div className="mt-8 space-y-4">
            {[
              [
                "Transparent before generation",
                "Users see the model and estimated credits before submitting.",
              ],
              [
                "Cash and cheque ready",
                "Finance staff can confirm manual OMR payments and assign credits.",
              ],
              [
                "Separated permissions",
                "Organization access and platform finance authority stay independent.",
              ],
            ].map(([title, detail]) => (
              <div key={title} className="flex gap-3">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-success/10 text-success">
                  <Icon name="check" className="size-3.5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {title}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-subtle-foreground">
                    {detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative rounded-[30px] border border-border bg-card p-5 shadow-2xl shadow-black/30 sm:p-7">
          <div className="absolute -right-16 -top-16 size-48 rounded-full bg-info/10 blur-3xl" />
          <div className="relative flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">
                Finance overview
              </p>
              <p className="mt-1 text-xs text-subtle-foreground">
                September 2026
              </p>
            </div>
            <span className="rounded-full bg-success/10 px-3 py-1 text-[10px] font-bold text-success">
              Healthy
            </span>
          </div>
          <div className="relative mt-6 grid gap-3 sm:grid-cols-3">
            {[
              ["Credits issued", "48,200"],
              ["Credits used", "31,480"],
              ["Pending OMR", "275.000"],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-2xl border border-border bg-foreground/[0.025] p-4"
              >
                <p className="text-[10px] text-subtle-foreground">{label}</p>
                <p className="mt-2 text-xl font-semibold text-foreground">
                  {value}
                </p>
              </div>
            ))}
          </div>
          <div className="relative mt-4 rounded-2xl border border-border bg-surface-sunken p-4">
            <div className="flex items-end justify-between gap-2 h-40">
              {[35, 52, 43, 68, 58, 78, 64, 92, 72, 84, 66, 88].map(
                (height, index) => (
                  <div
                    key={`${height}-${index}`}
                    className="flex h-full flex-1 items-end"
                  >
                    <span
                      className="w-full rounded-t bg-gradient-to-t from-primary/45 to-info/80"
                      style={{ height: `${height}%` }}
                    />
                  </div>
                ),
              )}
            </div>
            <div className="mt-3 flex justify-between text-[9px] uppercase tracking-wider text-subtle-foreground">
              <span>Week 1</span>
              <span>Week 2</span>
              <span>Week 3</span>
              <span>Week 4</span>
            </div>
          </div>
          <p className="relative mt-3 text-center text-[10px] text-subtle-foreground">
            Illustrative preview · not live financial data
          </p>
        </div>
      </section>

      <footer className="border-t border-border">
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

function ProductPreview() {
  return (
    <div className="relative mx-auto mt-16 max-w-6xl">
      <div className="absolute inset-x-[15%] -bottom-8 h-24 rounded-full bg-primary/25 blur-3xl" />
      <div className="relative overflow-hidden rounded-[24px] border border-border bg-card p-2 shadow-[0_45px_120px_rgba(0,0,0,.55)] sm:rounded-[32px] sm:p-3">
        <div className="overflow-hidden rounded-[18px] border border-border bg-card sm:rounded-[24px]">
          <div className="flex h-11 items-center justify-between border-b border-border px-4">
            <div className="flex gap-1.5">
              <span className="size-2 rounded-full bg-destructive/60" />
              <span className="size-2 rounded-full bg-warning/60" />
              <span className="size-2 rounded-full bg-success/60" />
            </div>
            <span className="text-[9px] font-semibold uppercase tracking-[.18em] text-subtle-foreground">
              creator.aiwamediagroup.com
            </span>
            <span className="w-8" />
          </div>
          <div className="grid min-h-[390px] text-left md:grid-cols-[170px_1fr]">
            <div className="hidden border-r border-border p-4 md:block">
              <Brand compact />
              <div className="mt-8 space-y-2">
                {["Dashboard", "Create", "Projects", "Assets"].map(
                  (item, index) => (
                    <div
                      key={item}
                      className={`rounded-lg px-3 py-2 text-[10px] font-medium ${index === 1 ? "bg-foreground/[0.07] text-foreground" : "text-subtle-foreground"}`}
                    >
                      {item}
                    </div>
                  ),
                )}
              </div>
              <div className="mt-24 rounded-xl border border-primary/10 bg-primary/[0.05] p-3">
                <p className="text-[9px] text-subtle-foreground">
                  Available credits
                </p>
                <p className="mt-1 text-lg font-semibold text-foreground">
                  12,840
                </p>
              </div>
            </div>
            <div className="min-w-0 p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-semibold text-primary">
                    CREATION STUDIO
                  </p>
                  <p className="mt-1 text-lg font-semibold text-foreground sm:text-xl">
                    Make something remarkable.
                  </p>
                </div>
                <div className="hidden rounded-lg bg-foreground px-3 py-2 text-[9px] font-bold text-background sm:block">
                  + New creation
                </div>
              </div>
              <div className="mt-5 grid gap-3 lg:grid-cols-[1.1fr_.9fr]">
                <div className="rounded-2xl border border-border bg-surface-sunken p-4">
                  <div className="grid grid-cols-3 gap-1 rounded-xl bg-background/75 p-1">
                    {[
                      ["image", "Image"],
                      ["video", "Video"],
                      ["voice", "Voice"],
                    ].map(([icon, label], index) => (
                      <div
                        key={label}
                        className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[9px] font-semibold ${index === 0 ? "bg-foreground text-background" : "text-subtle-foreground"}`}
                      >
                        <Icon name={icon as IconName} className="size-3" />
                        {label}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 h-24 rounded-xl border border-border bg-foreground/[0.02] p-3 text-[10px] leading-5 text-subtle-foreground">
                    A premium campaign visual inspired by Oman&apos;s coastline
                    at golden hour…
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {["Seedream 5.0 Lite", "Seedream 4.5"].map(
                      (model, index) => (
                        <div
                          key={model}
                          className={`rounded-xl border p-3 ${index === 0 ? "border-primary/35 bg-primary/[0.07]" : "border-border"}`}
                        >
                          <p className="text-[9px] font-semibold text-foreground/90">
                            {model}
                          </p>
                          <p className="mt-1 text-[8px] text-subtle-foreground">
                            BytePlus
                          </p>
                        </div>
                      ),
                    )}
                  </div>
                </div>
                <div className="relative hidden min-h-64 overflow-hidden rounded-2xl border border-border bg-[linear-gradient(145deg,#12182b,#3b245c_55%,#bd704f)] lg:block">
                  <div className="absolute -right-10 -top-10 size-40 rounded-full bg-orange-200/60 blur-3xl" />
                  <div className="absolute bottom-8 left-1/2 h-32 w-16 -translate-x-1/2 rounded-t-[32px] rounded-b-xl border border-white/20 bg-foreground/10 shadow-2xl backdrop-blur-sm" />
                  <p className="absolute left-4 top-4 text-[8px] font-bold uppercase tracking-[.2em] text-on-vivid/60">
                    Output preview
                  </p>
                  <div className="absolute inset-x-3 bottom-3 rounded-xl bg-black/35 px-3 py-2 backdrop-blur-md">
                    <p className="text-[8px] text-on-vivid/55">
                      Estimated cost
                    </p>
                    <p className="mt-0.5 text-[10px] font-semibold text-on-vivid">
                      28 credits / image
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
