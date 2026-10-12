import Link from "next/link";
import { Brand } from "@/components/ui/brand";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Icon } from "@/components/ui/icon";

export function ToolsHeader() {
  return (
    <header className="relative z-30 border-b border-border bg-background/90">
      <div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-3 px-5 sm:px-7 lg:px-10">
        <div className="sm:hidden">
          <Brand compact />
        </div>
        <div className="hidden sm:block">
          <Brand />
        </div>
        <nav
          aria-label="Public navigation"
          className="hidden items-center gap-5 text-xs font-semibold text-muted-foreground md:flex"
        >
          <Link href="/tools" className="text-primary">
            Explore tools
          </Link>
          <Link href="/pricing" className="hover:text-foreground">
            Pricing
          </Link>
          <Link href="/learn" className="hover:text-foreground">
            Learn
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            className="hidden rounded-xl px-3 py-2 text-xs font-semibold hover:bg-secondary sm:inline-flex"
            href="/sign-in"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground transition hover:opacity-90 sm:px-4"
          >
            <span className="sm:hidden">Start</span>
            <span className="hidden sm:inline">Start creating</span>
            <Icon name="arrow" className="hidden size-4 sm:inline" />
          </Link>
        </div>
      </div>
    </header>
  );
}
export function ToolsFooter() {
  return (
    <footer className="border-t border-border bg-sidebar/35">
      <div className="mx-auto flex max-w-7xl flex-col justify-between gap-5 px-5 py-9 sm:px-7 md:flex-row md:items-center lg:px-10">
        <div>
          <Brand />
          <p className="mt-2 text-xs text-muted-foreground">
            From first thought to final media.
          </p>
        </div>
        <nav
          aria-label="Footer"
          className="flex flex-wrap gap-5 text-xs font-semibold text-muted-foreground"
        >
          <Link href="/">Home</Link>
          <Link href="/tools">All tools</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/learn">Learn</Link>
          <Link href="/privacy-policy">Privacy</Link>
          <Link href="/terms-of-service">Terms</Link>
        </nav>
      </div>
    </footer>
  );
}
export function ToolsConversion({
  title = "Your next creative project starts here.",
  toolId,
}: {
  title?: string;
  toolId?: string;
}) {
  return (
    <section className="relative overflow-hidden rounded-[32px] border border-border bg-card p-7 shadow-sm sm:p-10 lg:p-12">
      <div
        className="creative-glow pointer-events-none absolute inset-0"
        aria-hidden="true"
      />
      <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="max-w-2xl">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[.16em] text-primary">
            From idea to output
          </p>
          <h2 className="font-display mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-5xl">
            {title}
          </h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            Explore your creative options, choose an available model and review
            the Studio quote before any billable work starts.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href={toolId ? "/tools/start/" + toolId : "/sign-up"}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground hover:opacity-90"
          >
            Start creating <Icon name="arrow" className="size-4" />
          </Link>
          <Link
            href="/pricing"
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-background px-6 py-3 text-sm font-bold hover:bg-secondary"
          >
            Explore pricing
          </Link>
        </div>
      </div>
    </section>
  );
}
