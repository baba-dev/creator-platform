import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Brand } from "@/components/ui/brand";
import { Annotation, Eyebrow } from "@/components/ui/creative";
import { Icon } from "@/components/ui/icon";
import { PencilArrow, Tape } from "@/components/ui/sketch";

type AuthCardProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footerText: string;
  footerHref: Route;
  footerLabel: string;
};

export function AuthCard({
  eyebrow,
  title,
  description,
  children,
  footerText,
  footerHref,
  footerLabel,
}: AuthCardProps) {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-background px-4 py-6 sm:px-6 sm:py-10">
      <div className="creative-glow pointer-events-none absolute inset-0" />
      <div className="paper-grid pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(circle_at_center,black,transparent_78%)]" />
      <div className="paper-sheet relative w-full max-w-5xl overflow-hidden rounded-[30px] lg:grid lg:grid-cols-[.94fr_1.06fr]">
        <aside className="relative hidden overflow-hidden border-r border-border bg-primary/[0.045] p-10 lg:flex lg:flex-col">
          <div className="paper-dots absolute inset-0 opacity-55" />
          <div className="absolute -left-16 top-1/3 size-64 rounded-full bg-primary/14 blur-3xl" />
          <div className="absolute -right-24 bottom-0 size-64 rounded-full bg-info/12 blur-3xl" />
          <div className="relative flex items-center justify-between">
            <Brand />
            <ThemeToggle />
          </div>
          <div className="relative my-auto py-12">
            <span className="sketch-ring grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Icon name="sparkles" />
            </span>
            <h2 className="font-display mt-7 max-w-sm text-4xl font-semibold leading-[1.05] tracking-[-0.045em] text-foreground">
              Your next bright idea starts as a scribble.
            </h2>
            <p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
              Shape it with image, video, and voice tools—then keep the work,
              people, and credits organized in one creative home.
            </p>
            <div className="relative mt-9 grid grid-cols-3 gap-2">
              {[
                ["image", "Image"],
                ["video", "Video"],
                ["voice", "Voice"],
              ].map(([icon, label]) => (
                <div
                  key={label}
                  className="rounded-xl border border-border bg-card/65 p-3 text-center shadow-xs backdrop-blur"
                >
                  <Icon
                    name={icon as "image" | "video" | "voice"}
                    className="mx-auto size-4 text-muted-foreground"
                  />
                  <p className="mt-2 text-[10px] font-semibold text-muted-foreground">
                    {label}
                  </p>
                </div>
              ))}
              <PencilArrow className="absolute -right-7 -top-14 h-12 w-20 -rotate-12" />
            </div>
            <div className="relative ml-auto mt-7 w-fit rotate-2 rounded-lg border border-border bg-card px-4 py-2 shadow-sketch">
              <Tape className="-top-2 left-8 h-4 w-14" />
              <Annotation className="text-lg text-foreground">
                imagine → make → share
              </Annotation>
            </div>
          </div>
          <p className="relative font-mono text-[9px] uppercase tracking-[0.12em] text-subtle-foreground">
            Private platform · Aiwa Media Group · Oman
          </p>
        </aside>

        <section className="relative bg-card/82 p-6 backdrop-blur-xl sm:p-10 lg:p-12">
          <div className="mb-10 flex items-center justify-between gap-3 lg:hidden">
            <Brand />
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <Link
                href="/"
                className="rounded-lg px-2 py-2 text-xs font-semibold text-subtle-foreground hover:bg-secondary hover:text-foreground"
              >
                Home
              </Link>
            </div>
          </div>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="font-display mt-3 text-4xl font-semibold tracking-[-0.045em] text-foreground sm:text-5xl">
            {title}
          </h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
            {description}
          </p>

          <div className="mt-8 max-w-md">{children}</div>

          <p className="mt-7 max-w-md border-t border-border pt-6 text-center text-xs text-subtle-foreground">
            {footerText}{" "}
            <Link
              href={footerHref}
              className="font-semibold text-primary transition hover:text-primary"
            >
              {footerLabel}
            </Link>
          </p>

          <div className="mt-5 flex max-w-md items-center justify-center gap-2 text-[10px] text-subtle-foreground">
            <span className="size-1.5 rounded-full bg-success" /> Email and
            password access only
          </div>
        </section>
      </div>
    </main>
  );
}
