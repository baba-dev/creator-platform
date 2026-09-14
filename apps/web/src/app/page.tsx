import { Button } from "@aiwa/ui/button";

const mediaTools = [
  {
    name: "Image Lab",
    eyebrow: "Generate · Edit · Upscale",
    description:
      "Turn briefs and references into campaign-ready visuals with model-aware controls.",
    accent: "from-cyan-300/25 via-cyan-300/5 to-transparent",
    glyph: "◈",
  },
  {
    name: "Video Studio",
    eyebrow: "Story · Shot list · Motion",
    description:
      "Shape an idea into scenes, then submit and track long-running video generations.",
    accent: "from-violet-400/25 via-violet-400/5 to-transparent",
    glyph: "▶",
  },
  {
    name: "Voice Room",
    eyebrow: "Speech · Localization · Delivery",
    description:
      "Create polished English and Arabic narration with transparent usage pricing.",
    accent: "from-amber-300/25 via-amber-300/5 to-transparent",
    glyph: "∿",
  },
] as const;

const navigation = ["Create", "Projects", "Assets", "Usage", "Administration"];

export default function HomePage() {
  return (
    <main className="mx-auto min-h-screen max-w-[1600px] px-4 py-4 sm:px-6 lg:px-8">
      <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/65 shadow-2xl shadow-black/40 backdrop-blur-xl">
        <header className="flex min-h-20 items-center justify-between border-b border-white/10 px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-cyan-300 font-black text-slate-950">
              A
            </div>
            <div>
              <p className="text-sm font-bold tracking-wide text-white">
                AIWA CREATORS
              </p>
              <p className="text-xs text-slate-500">
                Creative intelligence workspace
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs font-medium text-amber-200 sm:inline-flex">
              Foundation preview
            </span>
            <Button variant="secondary" size="sm">
              Internal access
            </Button>
          </div>
        </header>

        <div className="grid lg:grid-cols-[220px_1fr]">
          <aside className="hidden border-r border-white/10 p-5 lg:block">
            <nav aria-label="Primary navigation" className="space-y-1">
              {navigation.map((item, index) => (
                <a
                  key={item}
                  href={`#${item.toLowerCase()}`}
                  className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition-colors ${
                    index === 0
                      ? "bg-white/[0.08] font-medium text-white"
                      : "text-slate-500 hover:bg-white/[0.04] hover:text-slate-300"
                  }`}
                >
                  {item}
                  {index === 0 ? (
                    <span className="text-cyan-300">●</span>
                  ) : null}
                </a>
              ))}
            </nav>
            <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Provider policy
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                BytePlus generates media. NVIDIA assists planning and reasoning.
              </p>
            </div>
          </aside>

          <section className="p-5 sm:p-8 lg:p-10" id="create">
            <div className="max-w-3xl">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.28em] text-cyan-300">
                One workspace · Every creative format
              </p>
              <h1 className="text-balance text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl lg:text-6xl">
                Make the idea. Keep control of the cost.
              </h1>
              <p className="mt-5 max-w-2xl text-pretty text-base leading-7 text-slate-400 sm:text-lg">
                A production-minded home for AI image, video, and voice
                workflows—with model selection, clear credit prices, durable job
                tracking, and finance controls built in from day one.
              </p>
            </div>

            <div className="mt-10 grid gap-4 xl:grid-cols-3">
              {mediaTools.map((tool) => (
                <article
                  key={tool.name}
                  className="group relative min-h-72 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] p-6 transition-transform duration-300 hover:-translate-y-1"
                >
                  <div
                    className={`absolute inset-0 bg-gradient-to-br ${tool.accent} opacity-80 transition-opacity group-hover:opacity-100`}
                  />
                  <div className="relative flex h-full flex-col">
                    <span className="grid size-12 place-items-center rounded-2xl border border-white/15 bg-slate-950/60 text-xl text-white">
                      {tool.glyph}
                    </span>
                    <p className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      {tool.eyebrow}
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-white">
                      {tool.name}
                    </h2>
                    <p className="mt-3 text-sm leading-6 text-slate-400">
                      {tool.description}
                    </p>
                    <div className="mt-auto pt-6 text-sm font-semibold text-slate-200">
                      Select workflow <span aria-hidden="true">→</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-[1.4fr_1fr]">
              <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-6 sm:p-8">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                      Repository foundation
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-white">
                      Built for real operations
                    </h2>
                  </div>
                  <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                    Bootstrap active
                  </span>
                </div>
                <div className="mt-7 grid gap-3 sm:grid-cols-3">
                  {[
                    ["Ledger-first", "Immutable credits"],
                    ["Queue-backed", "Durable jobs"],
                    ["Provider-safe", "Server-only keys"],
                  ].map(([title, detail]) => (
                    <div
                      key={title}
                      className="rounded-2xl bg-white/[0.04] p-4"
                    >
                      <p className="font-semibold text-slate-200">{title}</p>
                      <p className="mt-1 text-sm text-slate-500">{detail}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-cyan-300/15 bg-cyan-300/[0.055] p-6 sm:p-8">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">
                  Cost discipline
                </p>
                <p className="mt-4 text-3xl font-semibold tracking-tight text-white">
                  Quote → Reserve → Capture
                </p>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  Every billable request is priced and funded before it reaches
                  a media provider. Failures release the reservation
                  automatically.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
