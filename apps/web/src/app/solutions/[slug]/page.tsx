import type { Metadata, Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { SectionTitle, SolutionCard, SolutionFaq, SolutionsConversion, SolutionsFooter, SolutionsHeader } from "@/components/marketing/solutions/solution-components";
import { SolutionModels } from "@/components/marketing/solutions/solution-models";
import { getPublicPricingCatalogue } from "@/lib/public-pricing";
import { publicToolById } from "@/lib/public-tools";
import { solutionBySlug, solutions, solutionHref } from "@/lib/public-solutions";

export const dynamic = "force-dynamic";
type PageProps = { params: Promise<{ slug: string }> };
export function generateStaticParams() {
  return solutions.map((solution) => ({ slug: solution.slug }));
}
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const solution = solutionBySlug((await params).slug);
  if (!solution) return { title: "Solution not found", robots: { index: false } };
  return {
    title: solution.name + " — Creative AI Workflows & Outcomes",
    description: solution.description.slice(0, 160),
    alternates: { canonical: solutionHref(solution) },
    robots: { index: true, follow: true },
    openGraph: {
      title: solution.headline + " · Aiwa Creators",
      description: solution.description, type: "website",
      images: [{ url: solution.cover, width: 920, height: 650, alt: solution.name + " illustration" }],
    },
  };
}

export default async function SolutionDetailPage({ params }: PageProps) {
  const solution = solutionBySlug((await params).slug);
  if (!solution) notFound();
  const catalogue = await getPublicPricingCatalogue().catch(() => ({ models: [] }));
  const origin = process.env.APP_URL ?? "https://creator.aiwamediagroup.com";
  const breadcrumbs = [
    { name: "Home", item: "/" },
    { name: "Solutions", item: "/solutions" },
    { name: solution.name, item: solutionHref(solution) },
  ];
  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbs.map((item, i) => ({
      "@type": "ListItem", position: i + 1, name: item.name,
      item: new URL(item.item, origin).toString(),
    })),
  };
  const related = solution.related.map(solutionBySlug).filter((item) => item !== undefined);
  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <SolutionsHeader />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
      <section className="relative overflow-hidden border-b border-border">
        <div className="creative-glow pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="relative mx-auto max-w-7xl px-5 py-5 sm:px-7 lg:px-10">
          <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 text-xs font-semibold text-muted-foreground">
            <Link href="/">Home</Link><span aria-hidden="true">/</span>
            <Link href="/solutions" className="hover:text-primary">Solutions</Link><span aria-hidden="true">/</span>
            <span aria-current="page" className="text-foreground">{solution.name}</span>
          </nav>
        </div>
        <div className="relative mx-auto grid max-w-7xl gap-10 px-5 pb-16 pt-7 sm:px-7 lg:grid-cols-[1fr_1fr] lg:items-center lg:px-10 lg:pb-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-primary"><Icon name={solution.icon} className="size-4" /> {solution.name}</p>
            <h1 className="font-display mt-6 max-w-2xl text-balance text-4xl font-semibold leading-[1.06] tracking-[-.055em] sm:text-5xl lg:text-6xl">{solution.headline}</h1>
            <p className="mt-6 max-w-xl text-base leading-8 text-muted-foreground">{solution.description}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#workflow" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground hover:opacity-90">See the workflow <Icon name="arrow" className="size-4" /></a>
              <Link href="/pricing" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-card px-6 py-3 text-sm font-bold hover:bg-secondary">Explore pricing</Link>
            </div>
            <p className="mt-6 text-xs font-medium text-muted-foreground">Ideal for: {solution.idealFor}</p>
          </div>
          <div>
            <Image src={solution.cover} width={920} height={650} priority alt={solution.name + " original illustrated creative campaign"} className="w-full rounded-[30px] border border-border shadow-sketch" />
            <p className="mt-3 text-xs text-muted-foreground">Illustrative editorial artwork, not a customer case study or guaranteed model output.</p>
          </div>
        </div>
      </section>
      <nav aria-label="On this page" className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl gap-6 overflow-x-auto px-5 py-4 text-xs font-bold text-muted-foreground sm:px-7 lg:px-10">
          {[["#challenge", "The challenge"], ["#benefits", "What changes"], ["#workflow", "Workflow"], ["#deliverables", "Deliverables"], ["#models", "Models"], ["#faq", "FAQs"]].map(([href, text]) => <a className="shrink-0 hover:text-primary" key={href} href={href}>{text}</a>)}
        </div>
      </nav>
      <section id="challenge" className="scroll-mt-28 mx-auto grid max-w-7xl gap-8 px-5 py-20 sm:px-7 lg:grid-cols-2 lg:items-start lg:px-10">
        <SectionTitle eyebrow="The challenge" title="Make the process work for your goal." description={solution.challenge} />
        <div className="rounded-3xl border border-border bg-card p-7 shadow-sm sm:p-9">
          <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-primary">The outcome</p>
          <h3 className="font-display mt-4 text-2xl font-semibold">{solution.outcome}</h3>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">Start with an objective. Discover the right creative workflow. Review available models and pricing before creating in your own workspace.</p>
        </div>
      </section>
      <section id="benefits" className="scroll-mt-28 border-y border-border bg-secondary/30">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-7 lg:px-10">
          <SectionTitle eyebrow="What you can achieve" title="A better way to move from intent to output." />
          <div className="mt-9 grid gap-4 md:grid-cols-3">
            {solution.benefits.map((benefit, i) => <article key={benefit.title} className="rounded-2xl border border-border bg-card p-6">
              <p className="font-hand text-3xl text-primary">{String(i + 1).padStart(2, "0")}</p>
              <h3 className="font-display mt-5 text-xl font-semibold">{benefit.title}</h3>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">{benefit.description}</p>
            </article>)}
          </div>
        </div>
      </section>
      <section id="workflow" className="scroll-mt-28 mx-auto max-w-7xl px-5 py-20 sm:px-7 lg:px-10">
        <SectionTitle eyebrow="From brief to result" title="A connected creative workflow." description="Each step links to a real Creators Studio. What is available depends on supported input materials, enabled models and configuration." />
        <ol className="mt-9 grid gap-5 md:grid-cols-2">
          {solution.workflow.map((step, index) => {
            const tool = publicToolById(step.toolId);
            return tool ? <li key={step.toolId} className="flex h-full flex-col rounded-2xl border border-border bg-card p-6">
              <p className="font-mono text-xs font-bold text-primary">{String(index + 1).padStart(2, "0")} / {tool.title}</p>
              <span className="mt-5 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><Icon name={tool.icon} className="size-5" /></span>
              <h3 className="font-display mt-4 text-xl font-semibold">{step.title}</h3>
              <p className="mt-3 flex-1 text-sm leading-7 text-muted-foreground">{step.description}</p>
              <div className="mt-6 flex flex-wrap gap-4 border-t border-border pt-4 text-xs font-bold">
                <Link href={("/tools/" + tool.slug) as Route} className="text-primary hover:underline">Explore tool ↗</Link>
                <Link href={("/tools/start/" + tool.id) as Route} className="text-foreground hover:text-primary">Start creating →</Link>
              </div>
            </li> : null;
          })}
        </ol>
      </section>
      <section id="deliverables" className="scroll-mt-28 border-y border-border bg-secondary/30">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-20 sm:px-7 lg:grid-cols-[1fr_1fr] lg:items-center lg:px-10">
          <div>
            <SectionTitle eyebrow="What you can make" title="One creative direction. Multiple deliverables." description="Use the relevant workflows to explore different formats, then review, refine and save the results as assets." />
            <ul className="mt-7 grid gap-3 sm:grid-cols-2">
              {solution.deliverables.map((deliverable) => <li key={deliverable} className="flex items-center gap-2 rounded-xl border border-border bg-card p-3 text-sm font-semibold"><Icon name="check" className="size-4 shrink-0 text-primary" />{deliverable}</li>)}
            </ul>
          </div>
          <Image src={solution.cover} width={920} height={650} alt={solution.name + " illustrated media deliverables"} className="w-full rounded-3xl border border-border" />
        </div>
      </section>
      <SolutionModels models={catalogue.models} categories={solution.modelCategories} compact />
      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-7 lg:px-10">
        <SectionTitle eyebrow="Keep exploring" title="Other ways to use Creators." />
        <div className="mt-8 grid gap-5 md:grid-cols-2">{related.map((item) => <SolutionCard key={item.slug} solution={item} />)}</div>
      </section>
      <section id="faq" className="scroll-mt-28 mx-auto max-w-4xl px-5 py-16 sm:px-7">
        <SectionTitle eyebrow="Good to know" title="Questions before you begin." />
        <SolutionFaq questions={solution.questions} />
      </section>
      <div className="mx-auto max-w-7xl px-5 pb-20 sm:px-7 lg:px-10"><SolutionsConversion title={"Bring your next " + solution.name.toLowerCase() + " idea to life."} toolId={solution.workflow[0]?.toolId} /></div>
      <SolutionsFooter />
    </main>
  );
}
