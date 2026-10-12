import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@aiwa/ui/button";
import { Brand } from "@/components/ui/brand";
import { Icon } from "@/components/ui/icon";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { PricingArtwork } from "@/components/marketing/pricing-artwork";
import { PricingExplorer } from "@/components/marketing/pricing-explorer";
import { getPublicPricingCatalogue } from "@/lib/public-pricing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "AI model pricing: images, video, voice, chat & media tools",
  description: "Explore live Aiwa Creators customer pricing by model and task. Compare image, video, chat, speech, transcription and MediaKit tools in credits and OMR.",
  alternates: { canonical: "/pricing" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Clear AI model pricing · Aiwa Creators",
    description: "Explore model capabilities, billing units, credits and OMR before you create.",
    type: "website",
  },
};

const questions = [
  { question: "What is one credit worth?", answer: "The standard denomination for newly published prices is one credit per baisa: 1,000 credits correspond to 1.000 OMR. An individual model's published price version remains authoritative, including any historic denomination." },
  { question: "Why do some models show reference rates?", answer: "Resolution, input assets, additional references, duration and provider-reported usage can affect a generation's final cost. We show a published reference unit, not a promise that every configuration costs the same." },
  { question: "When am I charged?", answer: "The workspace displays an authenticated quote before submission. Applicable credits may be reserved; successful jobs settle according to the published policy, and unused reservations are released where supported." },
  { question: "Can I compare free and paid text models?", answer: "Only currently enabled models with published customer pricing and configured provider access appear here. Token-rate tiers display the customer retail equivalent for each applicable tier." },
  { question: "Can I generate directly from this page?", answer: "No. This public page does not submit jobs or access an organization wallet. Sign in to see the exact parameters, signed quote and available credit balance before you proceed." },
] as const;

export default async function PricingPage() {
  const catalogue = await getPublicPricingCatalogue();
  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <div className="creative-glow pointer-events-none absolute inset-x-0 top-0 h-[800px]" aria-hidden="true" />
      <header className="relative z-30 border-b border-border bg-background/85">
        <div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-3 px-5 sm:px-7 lg:px-10">
          <Brand />
          <nav aria-label="Public pricing navigation" className="hidden items-center gap-5 text-xs font-semibold text-muted-foreground md:flex">
            <Link href="/">Home</Link><a href="#catalogue" className="hover:text-primary">Models</a><a href="#calculator" className="hover:text-primary">Calculator</a><a href="#faq" className="hover:text-primary">FAQ</a><Link href="/learn" className="hover:text-primary">Learn</Link>
          </nav>
          <div className="flex items-center gap-2"><ThemeToggle /><Button size="sm" variant="ghost" asChild className="hidden sm:inline-flex"><Link href="/sign-in">Sign in</Link></Button><Button size="sm" asChild><Link href="/sign-up">Start creating <Icon name="arrow" className="hidden size-4 sm:inline" /></Link></Button></div>
        </div>
      </header>
      <section className="relative mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:px-7 sm:py-24 lg:grid-cols-[1fr_1fr] lg:items-center lg:px-10 lg:py-28">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[.14em] text-primary"><Icon name="credits" className="size-4" /> Transparent, usage-based pricing</p>
          <h1 className="font-display mt-7 max-w-2xl text-balance text-5xl font-semibold leading-[1.02] tracking-[-.055em] sm:text-6xl lg:text-[70px]">Create anything.<span className="block text-primary">Know what it costs.</span></h1>
          <p className="mt-6 max-w-xl text-base leading-8 text-muted-foreground">A clear look at the AI models behind your creative workspace. Explore their capabilities, where to use them, and what each published customer rate means in credits and OMR.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row"><Button asChild size="lg"><a href="#catalogue">Explore model pricing <Icon name="arrow" className="size-4" /></a></Button><Button asChild size="lg" variant="secondary"><a href="#calculator">Estimate a creation</a></Button></div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-xs font-semibold text-muted-foreground"><span className="flex items-center gap-2"><Icon name="check" className="size-4 text-success" /> No sign-in to browse</span><span className="flex items-center gap-2"><Icon name="check" className="size-4 text-success" /> Published customer rates</span><span className="flex items-center gap-2"><Icon name="check" className="size-4 text-success" /> Quote before generation</span></div>
        </div>
        <PricingArtwork />
      </section>
      <section className="border-y border-border bg-card/45">
        <div className="mx-auto grid max-w-7xl gap-7 px-5 py-12 sm:px-7 md:grid-cols-[1fr_1fr] lg:grid-cols-[1.1fr_1fr_1fr] lg:px-10">
          <div><p className="font-mono text-[10px] font-bold uppercase tracking-widest text-primary">Understanding your wallet</p><h2 className="font-display mt-3 text-2xl font-semibold">Simple credits.<br />Real clarity.</h2><p className="mt-3 max-w-sm text-xs leading-6 text-muted-foreground">The standard denomination for new prices is one credit per baisa. Every published model price carries its own immutable billing snapshot.</p></div>
          <div className="rounded-2xl border border-border bg-background p-6"><Icon name="credits" className="size-6 text-primary" /><p className="font-display mt-4 text-3xl font-semibold tabular-nums">1,000 <span className="text-base font-medium text-muted-foreground">credits</span></p><p className="mt-2 text-sm text-muted-foreground">Standard equivalent: 1.000 OMR</p></div>
          <div className="rounded-2xl border border-border bg-background p-6"><Icon name="shield" className="size-6 text-primary" /><p className="mt-4 text-sm font-semibold">No hidden checkout guesswork.</p><p className="mt-2 text-xs leading-6 text-muted-foreground">See an authenticated quote, any maximum reservation and the billing basis before you submit a real generation. Public examples are informational only.</p></div>
        </div>
      </section>
      <PricingExplorer catalogue={catalogue} />
      <section id="faq" className="scroll-mt-24 mx-auto max-w-4xl px-5 py-16 sm:px-7 sm:py-24">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[.18em] text-primary">Clarity comes standard</p>
        <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">Frequently asked questions.</h2>
        <div className="mt-9 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">{questions.map((item) => <details key={item.question} className="group p-5 sm:p-6"><summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring">{item.question}<Icon name="chevron" className="size-4 shrink-0 transition group-open:rotate-90" /></summary><p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">{item.answer}</p></details>)}</div>
      </section>
      <section className="border-t border-border bg-sidebar/50 px-5 py-16 sm:px-7 sm:py-20">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 rounded-3xl border border-border bg-card p-7 shadow-sm sm:p-10 lg:flex-row lg:items-center">
          <div><p className="font-mono text-[10px] font-bold uppercase tracking-widest text-primary">From idea to output</p><h2 className="font-display mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Ready to make something?</h2><p className="mt-3 max-w-xl text-sm leading-7 text-muted-foreground">Open your workspace and get an exact quote for your chosen model and generation settings.</p></div>
          <Button asChild size="lg"><Link href="/sign-up">Start creating <Icon name="arrow" className="size-4" /></Link></Button>
        </div>
      </section>
      <footer className="border-t border-border bg-background"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5 px-5 py-8 sm:px-7 lg:px-10"><Brand /><nav aria-label="Footer navigation" className="flex flex-wrap gap-5 text-xs text-muted-foreground"><Link href="/">Home</Link><Link href="/pricing">Pricing</Link><Link href="/learn">Learn</Link><Link href="/privacy-policy">Privacy</Link><Link href="/terms-of-service">Terms</Link></nav></div></footer>
    </main>
  );
}
