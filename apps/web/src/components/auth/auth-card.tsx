import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Brand } from "@/components/ui/brand";
import { Icon } from "@/components/ui/icon";

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
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-background px-4 py-10 sm:px-6">
      <div className="creative-glow pointer-events-none absolute inset-0" />
      <div className="relative w-full max-w-5xl overflow-hidden rounded-[30px] border border-border bg-card/90 shadow-lg backdrop-blur-xl lg:grid lg:grid-cols-[.9fr_1.1fr]">
        <aside className="relative hidden overflow-hidden border-r border-border bg-primary/[0.04] p-10 lg:flex lg:flex-col">
          <div className="absolute -left-16 top-1/3 size-64 rounded-full bg-primary/15 blur-3xl" />
          <div className="absolute -right-24 bottom-0 size-64 rounded-full bg-info/10 blur-3xl" />
          <div className="relative flex items-center justify-between">
            <Brand />
            <ThemeToggle />
          </div>
          <div className="relative my-auto py-16">
            <span className="grid size-12 place-items-center rounded-2xl border border-primary/15 bg-primary/[0.08] text-primary">
              <Icon name="sparkles" />
            </span>
            <h2 className="mt-6 max-w-sm text-4xl font-semibold leading-tight tracking-[-0.04em] text-foreground">
              Create remarkable media from one workspace.
            </h2>
            <p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
              BytePlus generation, NVIDIA creative assistance, transparent
              credits, and organization-grade access control.
            </p>
            <div className="mt-8 grid grid-cols-3 gap-2">
              {[
                ["image", "Image"],
                ["video", "Video"],
                ["voice", "Voice"],
              ].map(([icon, label]) => (
                <div
                  key={label}
                  className="rounded-xl border border-border bg-foreground/[0.025] p-3 text-center"
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
            </div>
          </div>
          <p className="relative text-[10px] text-subtle-foreground">
            Private platform · Aiwa Media Group · Oman
          </p>
        </aside>

        <section className="p-6 sm:p-10 lg:p-12">
          <div className="mb-9 flex items-center justify-between lg:hidden">
            <Brand />
            <ThemeToggle />
            <Link
              href="/"
              className="text-xs font-medium text-subtle-foreground hover:text-foreground/90"
            >
              Home
            </Link>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
            {eyebrow}
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-foreground sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
            {description}
          </p>

          <div className="mt-8">{children}</div>

          <p className="mt-7 border-t border-border pt-6 text-center text-xs text-subtle-foreground">
            {footerText}{" "}
            <Link
              href={footerHref}
              className="font-semibold text-primary transition hover:text-primary"
            >
              {footerLabel}
            </Link>
          </p>

          <div className="mt-5 flex items-center justify-center gap-2 text-[10px] text-subtle-foreground">
            <span className="size-1.5 rounded-full bg-success" /> Email and
            password access only
          </div>
        </section>
      </div>
    </main>
  );
}
