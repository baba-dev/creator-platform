import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { ToolsConversion, ToolsFooter, ToolsHeader } from "@/components/marketing/tools/tools-shell";
import { solutionHref, type Solution } from "@/lib/public-solutions";

export { ToolsHeader as SolutionsHeader, ToolsFooter as SolutionsFooter, ToolsConversion as SolutionsConversion };

export function SectionTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return (
    <div className="max-w-3xl">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[.16em] text-primary">{eyebrow}</p>
      <h2 className="font-display mt-3 text-balance text-3xl font-semibold tracking-[-.04em] sm:text-5xl">{title}</h2>
      {description ? <p className="mt-5 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">{description}</p> : null}
    </div>
  );
}

export function SolutionCard({ solution }: { solution: Solution }) {
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition hover:-translate-y-1 hover:shadow-md">
      <Link href={solutionHref(solution) as Route} className="block overflow-hidden bg-surface-sunken" aria-label={"Explore " + solution.name}>
        <Image src={solution.cover} width={920} height={650} alt={solution.name + " original creative campaign illustration"} className="aspect-[16/10] w-full object-cover transition duration-500 motion-safe:group-hover:scale-[1.035]" />
      </Link>
      <div className="flex flex-1 flex-col p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon name={solution.icon} className="size-5" /></span>
          <h3 className="font-display text-xl font-semibold">{solution.name}</h3>
        </div>
        <p className="mt-3 flex-1 text-sm leading-7 text-muted-foreground">{solution.description}</p>
        <Link href={solutionHref(solution) as Route} className="mt-6 inline-flex min-h-10 items-center gap-2 border-t border-border pt-4 text-sm font-bold text-primary hover:underline">
          See the solution <Icon name="arrow" className="size-4" />
        </Link>
      </div>
    </article>
  );
}

export function SolutionFaq({ questions }: { questions: readonly { question: string; answer: string }[] }) {
  return (
    <div className="mt-8 overflow-hidden rounded-2xl border border-border bg-card">
      {questions.map((entry) => (
        <details className="group border-b border-border p-5 last:border-0" key={entry.question}>
          <summary className="flex min-h-7 cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold focus-visible:outline-2 focus-visible:outline-ring">
            {entry.question}<Icon name="chevron" className="size-4 shrink-0 transition group-open:rotate-90" />
          </summary>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground">{entry.answer}</p>
        </details>
      ))}
    </div>
  );
}
