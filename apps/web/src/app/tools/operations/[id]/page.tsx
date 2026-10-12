import type { Metadata, Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicPricingCatalogue } from "@/lib/public-pricing";
import {
  ToolsConversion,
  ToolsFooter,
  ToolsHeader,
} from "@/components/marketing/tools/tools-shell";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };
async function findOperation(id: string) {
  if (!id || id.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(id)) return null;
  const catalogue = await getPublicPricingCatalogue().catch(() => ({
    models: [],
  }));
  return (
    catalogue.models.find(
      (item) =>
        item.category === "tools" && item.kind === "tool" && item.id === id,
    ) ?? null
  );
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const item = await findOperation((await params).id);
  if (!item)
    return {
      title: "Operation unavailable",
      robots: { index: false, follow: false },
    };
  return {
    title: item.name + " — AI MediaKit",
    description: item.description.slice(0, 160),
    alternates: { canonical: "/tools/operations/" + item.id },
    robots: { index: true, follow: true },
    openGraph: {
      title: item.name + " · Aiwa Creators",
      description: item.description,
      type: "website",
    },
  };
}
export default async function OperationPage({ params }: Props) {
  const operation = await findOperation((await params).id);
  if (!operation) notFound();
  return (
    <main className="min-h-screen bg-background text-foreground">
      <ToolsHeader />
      <div className="mx-auto max-w-7xl px-5 py-5 sm:px-7 lg:px-10">
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap gap-2 text-xs text-muted-foreground"
        >
          <Link href="/">Home</Link>
          <span>/</span>
          <Link href="/tools">Tools</Link>
          <span>/</span>
          <Link href="/tools/mediakit">MediaKit</Link>
          <span>/</span>
          <span aria-current="page">{operation.name}</span>
        </nav>
      </div>
      <section className="mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:px-7 lg:grid-cols-2 lg:items-center lg:px-10 lg:py-20">
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-primary">
            Published MediaKit operation
          </p>
          <h1 className="font-display mt-5 text-balance text-5xl font-semibold tracking-tight">
            {operation.name}
          </h1>
          <p className="mt-6 text-base leading-8 text-muted-foreground">
            {operation.description}
          </p>
          <p className="mt-5 text-sm text-muted-foreground">
            This operation is currently included in Creators&apos; public
            customer pricing catalogue. Media inputs and account eligibility are
            verified in the workspace before execution.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href={"/tools/start/mediakit" as Route}
              className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground"
            >
              Open MediaKit →
            </Link>
            <Link
              href="/pricing"
              className="rounded-xl border border-border bg-card px-6 py-3 text-sm font-bold"
            >
              View published pricing
            </Link>
          </div>
        </div>
        <Image
          src="/tool-art/mediakit.svg"
          width={700}
          height={430}
          priority
          alt="Original MediaKit illustrated artwork"
          className="w-full rounded-3xl border border-border"
        />
      </section>
      <div className="mx-auto max-w-7xl px-5 pb-20 sm:px-7 lg:px-10">
        <ToolsConversion
          toolId="mediakit"
          title="Prepare your media in one connected workspace."
        />
      </div>
      <ToolsFooter />
    </main>
  );
}
