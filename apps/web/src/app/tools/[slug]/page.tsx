import type { Metadata, Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { getPublicPricingCatalogue } from "@/lib/public-pricing";
import {
  modelsForToolLanding,
  toolLandingBySlug,
} from "@/lib/public-tool-landings";
import {
  publicToolById,
  publicToolBySlug,
  publicTools,
  toolCategories,
} from "@/lib/public-tools";
import { ToolCard } from "@/components/marketing/tools/tool-explorer";
import {
  ToolsConversion,
  ToolsFooter,
  ToolsHeader,
} from "@/components/marketing/tools/tools-shell";
import { Icon } from "@/components/ui/icon";
import { ToolLandingPage } from "@/components/marketing/tools/tool-landing-page";

export const dynamic = "force-dynamic";
type PageProps = { params: Promise<{ slug: string }> };
export function generateStaticParams() {
  return publicTools.map((tool) => ({ slug: tool.slug }));
}
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const slug = (await params).slug;
  if (slug === "mediakit") {
    return {
      title: "MediaKit Tools",
      alternates: { canonical: "/tools/media-toolkit" },
      robots: { index: false, follow: true },
    };
  }
  const tool = publicToolBySlug(slug);
  if (!tool) return { title: "Tool not found", robots: { index: false } };
  const landing = toolLandingBySlug(slug);
  if (landing) {
    return {
      title: landing.seoTitle,
      description: landing.seoDescription,
      keywords: [...tool.keywords],
      alternates: { canonical: "/tools/" + tool.slug },
      robots: { index: true, follow: true },
      openGraph: {
        title: landing.seoTitle,
        description: landing.seoDescription,
        type: "website",
        images: [
          {
            url: landing.screenshot.src,
            width: 1060,
            height: 740,
            alt: landing.screenshot.alt,
          },
        ],
      },
      twitter: {
        card: "summary_large_image",
        title: landing.seoTitle,
        description: landing.seoDescription,
        images: [landing.screenshot.src],
      },
    };
  }
  return {
    title: tool.title + " — " + tool.headline,
    description: tool.summary.slice(0, 160),
    alternates: { canonical: "/tools/" + tool.slug },
    robots: { index: true, follow: true },
    openGraph: {
      title: tool.title + " · Aiwa Creators",
      description: tool.summary,
      type: "website",
      images: [
        {
          url: tool.cover,
          width: 700,
          height: 430,
          alt: tool.title + " illustration",
        },
      ],
    },
  };
}
export default async function ToolDetailPage({ params }: PageProps) {
  const slug = (await params).slug;
  if (slug === "mediakit") permanentRedirect("/tools/media-toolkit");
  const tool = publicToolBySlug(slug);
  if (!tool) notFound();
  const landing = toolLandingBySlug(slug);
  const origin = process.env.APP_URL ?? "https://creator.aiwamediagroup.com";
  if (landing) {
    const catalogue = await getPublicPricingCatalogue().catch(() => ({
      models: [],
      generatedAt: new Date(0).toISOString(),
    }));
    return (
      <ToolLandingPage
        tool={tool}
        landing={landing}
        models={modelsForToolLanding(landing, catalogue.models)}
        origin={origin}
      />
    );
  }
  const related = tool.relatedIds
    .map(publicToolById)
    .filter((item) => item !== undefined);
  const group = toolCategories.find(
    (category) => category.id === tool.category,
  );
  const operationCatalogue =
    tool.id === "mediakit"
      ? await getPublicPricingCatalogue().catch(() => ({ models: [] }))
      : null;
  const operations =
    operationCatalogue?.models.filter(
      (item) => item.category === "tools" && item.kind === "tool",
    ) ?? [];
  const breadcrumbs = [
    { name: "Home", item: "/" },
    { name: "All tools", item: "/tools" },
    { name: tool.title, item: "/tools/" + tool.slug },
  ];
  const breadcrumbData = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: new URL(crumb.item, origin).toString(),
    })),
  };
  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <ToolsHeader />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbData).replace(/</g, "\\u003c"),
        }}
      />
      <section className="relative overflow-hidden border-b border-border">
        <div
          className="creative-glow pointer-events-none absolute inset-0"
          aria-hidden="true"
        />
        <div className="relative mx-auto max-w-7xl px-5 py-5 sm:px-7 lg:px-10">
          <nav
            aria-label="Breadcrumb"
            className="flex flex-wrap gap-2 text-xs font-semibold text-muted-foreground"
          >
            <Link href="/" className="hover:text-primary">
              Home
            </Link>
            <span aria-hidden="true">/</span>
            <Link href="/tools" className="hover:text-primary">
              Tools
            </Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page" className="text-foreground">
              {tool.title}
            </span>
          </nav>
        </div>
        <div className="relative mx-auto grid max-w-7xl gap-10 px-5 pb-16 pt-7 sm:px-7 lg:grid-cols-[1fr_1fr] lg:items-center lg:px-10 lg:pb-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-primary">
              <Icon name={tool.icon} className="size-4" /> {group?.label}
            </p>
            <h1 className="font-display mt-6 text-balance text-5xl font-semibold leading-[1.05] tracking-[-.055em] sm:text-6xl">
              {tool.headline}
            </h1>
            <p className="mt-6 max-w-xl text-base leading-8 text-muted-foreground">
              {tool.summary}
            </p>
            <p className="mt-4 text-sm font-semibold">
              Ideal for: {tool.idealFor}
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href={("/tools/start/" + tool.id) as Route}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground hover:opacity-90"
              >
                Start creating <Icon name="arrow" className="size-4" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-card px-6 py-3 text-sm font-bold hover:bg-secondary"
              >
                Explore pricing
              </Link>
            </div>
            <p className="mt-5 text-xs text-muted-foreground">
              Browse without an account. Generation requires sign-in and a
              current Studio quote.
            </p>
          </div>
          <Image
            src={tool.cover}
            alt={tool.title + " original editorial illustration"}
            width={700}
            height={430}
            priority
            className="w-full rounded-[28px] border border-border shadow-sketch"
          />
        </div>
      </section>
      <nav
        aria-label="On this tool page"
        className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur-xl"
      >
        <div className="mx-auto flex max-w-7xl gap-6 overflow-x-auto px-5 py-4 text-xs font-bold text-muted-foreground sm:px-7 lg:px-10">
          {[
            ["#use-cases", "What to create"],
            ["#capabilities", "Capabilities"],
            ["#how-it-works", "How it works"],
            ["#related", "Related tools"],
            ["/pricing", "Pricing"],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href as Route}
              className="shrink-0 hover:text-primary"
            >
              {label}
            </Link>
          ))}
        </div>
      </nav>
      <section
        id="use-cases"
        className="scroll-mt-24 mx-auto max-w-7xl px-5 py-20 sm:px-7 lg:px-10"
      >
        <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-primary">
          Made for actual creative work
        </p>
        <h2 className="font-display mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
          What could you make?
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {tool.useCases.map((useCase, index) => (
            <article
              key={useCase}
              className="rounded-2xl border border-border bg-card p-6"
            >
              <span className="font-hand text-3xl font-bold text-primary">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="font-display mt-5 text-xl font-semibold">
                {useCase}
              </h3>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                Start with your own brief, then choose the model and available
                controls in the secure workspace.
              </p>
            </article>
          ))}
        </div>
      </section>
      <section
        id="capabilities"
        className="scroll-mt-24 border-y border-border bg-sidebar/40"
      >
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 sm:px-7 lg:grid-cols-[.8fr_1.2fr] lg:px-10 lg:py-24">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-primary">
              The toolkit
            </p>
            <h2 className="font-display mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
              The right controls for your idea.
            </h2>
            <p className="mt-5 text-sm leading-7 text-muted-foreground">
              Capabilities vary by enabled provider model or selected media
              operation. The workspace presents only settings supported by your
              choice.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {tool.capabilities.map((capability) => (
              <div
                key={capability}
                className="flex items-start gap-3 rounded-xl border border-border bg-card p-5"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Icon name="check" className="size-4" />
                </span>
                <p className="pt-2 text-sm font-semibold">{capability}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section
        id="how-it-works"
        className="scroll-mt-24 mx-auto max-w-7xl px-5 py-20 sm:px-7 lg:px-10"
      >
        <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-primary">
          Three steps
        </p>
        <h2 className="font-display mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
          From the brief to your workspace.
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {tool.workflow.map((step, index) => (
            <div
              key={step}
              className="rounded-2xl border border-border bg-card p-6"
            >
              <span className="font-hand text-4xl font-bold text-primary">
                {String(index + 1).padStart(2, "0")}
              </span>
              <p className="mt-5 text-sm font-semibold leading-7">{step}</p>
            </div>
          ))}
        </div>
      </section>
      {tool.id === "mediakit" ? (
        <section className="border-y border-border bg-sidebar/40">
          <div className="mx-auto max-w-7xl px-5 py-16 sm:px-7 lg:px-10">
            <h2 className="font-display text-3xl font-semibold">
              Published processing operations
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Listed only when enabled, configured and included in the public
              customer pricing catalogue.
            </p>
            {operations.length ? (
              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {operations.map((item) => (
                  <Link
                    key={item.id}
                    href={
                      ("/tools/operations/" +
                        encodeURIComponent(item.id)) as Route
                    }
                    className="rounded-xl border border-border bg-card p-5 hover:border-primary"
                  >
                    <h3 className="font-semibold">{item.name}</h3>
                    <p className="mt-2 text-xs leading-6 text-muted-foreground">
                      {item.description}
                    </p>
                    <p className="mt-3 text-xs font-bold text-primary">
                      Explore operation →
                    </p>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-5 rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
                No operations are currently published here. Please check the
                Pricing catalogue for current availability.
              </p>
            )}
          </div>
        </section>
      ) : null}
      <section
        id="related"
        className="scroll-mt-24 mx-auto max-w-7xl px-5 py-16 sm:px-7 lg:px-10"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-primary">
              Keep the creative thread
            </p>
            <h2 className="font-display mt-3 text-3xl font-semibold">
              Continue with related tools.
            </h2>
          </div>
          <Link
            href="/tools"
            className="text-sm font-bold text-primary hover:underline"
          >
            Browse all tools →
          </Link>
        </div>
        <div className="mt-7 grid gap-5 md:grid-cols-3">
          {related.map((item) => (
            <ToolCard key={item.id} tool={item} />
          ))}
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-5 pb-20 sm:px-7 lg:px-10">
        <ToolsConversion
          toolId={tool.id}
          title={"Ready to explore " + tool.title + "?"}
        />
      </section>
      <ToolsFooter />
    </main>
  );
}
