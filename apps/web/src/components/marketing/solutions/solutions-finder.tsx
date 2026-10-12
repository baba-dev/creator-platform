"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Icon } from "@/components/ui/icon";
import {
  recommendSolution,
  solutionHref,
  solutions,
  type FinderAudience,
  type FinderGoal,
  type FinderPriority,
} from "@/lib/public-solutions";

const goals: readonly { id: FinderGoal; title: string }[] = [
  { id: "campaign", title: "Create a complete campaign" },
  { id: "product", title: "Create product visuals" },
  { id: "social", title: "Make social content" },
  { id: "explainer", title: "Produce an explainer" },
  { id: "finish", title: "Improve existing media" },
];
const priorities: readonly { id: FinderPriority; title: string }[] = [
  { id: "speed", title: "Speed and simplicity" },
  { id: "quality", title: "Creative quality and control" },
  { id: "manage", title: "Managing several deliverables" },
  { id: "cost", title: "Understanding the costs" },
];

function ChoiceGroup<T extends string>({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: readonly { id: T; title: string }[];
  value: T | "";
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-3 text-sm font-bold">{title}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={value === option.id}
            onClick={() => onChange(option.id)}
            className={
              "min-h-11 rounded-xl border px-4 py-2 text-left text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-ring sm:text-sm " +
              (value === option.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card hover:bg-secondary")
            }
          >
            {option.title}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function SolutionsFinder() {
  const [audience, setAudience] = useState<FinderAudience | "">("");
  const [goal, setGoal] = useState<FinderGoal | "">("");
  const [priority, setPriority] = useState<FinderPriority | "">("");
  const [showResult, setShowResult] = useState(false);
  const result =
    showResult && audience && goal && priority
      ? recommendSolution(audience, goal, priority)
      : null;
  return (
    <section
      id="find-your-solution"
      className="scroll-mt-28 mx-auto max-w-7xl px-5 py-16 sm:px-7 lg:px-10"
      aria-labelledby="finder-title"
    >
      <div className="relative overflow-hidden rounded-[32px] border border-border bg-card p-5 shadow-sm sm:p-9 lg:p-12">
        <div
          className="creative-glow pointer-events-none absolute inset-0"
          aria-hidden="true"
        />
        <div className="relative max-w-3xl">
          <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-primary">
            A guided starting point
          </p>
          <h2
            id="finder-title"
            className="font-display mt-3 text-balance text-3xl font-semibold sm:text-5xl"
          >
            Tell us what you want to make.
          </h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            Answer three short questions. We will suggest real Creators tools
            and a suitable workflow. Exploring this guide is free and does not
            submit generation jobs.
          </p>
          <div className="mt-8 space-y-7">
            <ChoiceGroup
              title="1. Which describes you best?"
              options={solutions.map((s) => ({ id: s.slug, title: s.name }))}
              value={audience}
              onChange={(v) => {
                setAudience(v);
                setShowResult(false);
              }}
            />
            {audience ? (
              <ChoiceGroup
                title="2. What is your goal?"
                options={goals}
                value={goal}
                onChange={(v) => {
                  setGoal(v);
                  setShowResult(false);
                }}
              />
            ) : null}
            {audience && goal ? (
              <ChoiceGroup
                title="3. What matters most?"
                options={priorities}
                value={priority}
                onChange={(v) => {
                  setPriority(v);
                  setShowResult(false);
                }}
              />
            ) : null}
          </div>
          <button
            type="button"
            disabled={!audience || !goal || !priority}
            onClick={() => setShowResult(true)}
            className="mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Find my workflow <Icon name="arrow" className="size-4" />
          </button>
          {result ? (
            <div
              role="status"
              aria-live="polite"
              className="mt-8 rounded-2xl border border-primary/30 bg-background p-5 sm:p-7"
            >
              <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-primary">
                Your recommended starting point
              </p>
              <h3 className="font-display mt-3 text-2xl font-semibold">
                {result.solution.name}
              </h3>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                {result.solution.outcome} {result.advice}
              </p>
              <h4 className="mt-5 text-sm font-bold">Suggested tools</h4>
              <div className="mt-3 flex flex-wrap gap-2">
                {result.tools.map((tool) => (
                  <Link
                    key={tool.id}
                    href={("/tools/" + tool.slug) as Route}
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold hover:border-primary"
                  >
                    <Icon name={tool.icon} className="size-4 text-primary" />{" "}
                    {tool.title}
                  </Link>
                ))}
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href={solutionHref(result.solution) as Route}
                  className="inline-flex min-h-11 items-center rounded-xl bg-primary px-5 py-2 text-sm font-bold text-primary-foreground"
                >
                  View full solution →
                </Link>
                {result.tools[0] ? (
                  <Link
                    href={("/tools/start/" + result.tools[0].id) as Route}
                    className="inline-flex min-h-11 items-center rounded-xl border border-border px-5 py-2 text-sm font-bold hover:bg-secondary"
                  >
                    Start this workflow ↗
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
