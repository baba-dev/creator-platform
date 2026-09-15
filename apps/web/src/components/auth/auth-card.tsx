import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

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
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#070912] px-4 py-10 sm:px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(124,58,237,.18),transparent_30rem),radial-gradient(circle_at_80%_80%,rgba(6,182,212,.08),transparent_28rem)]" />
      <div className="relative w-full max-w-5xl overflow-hidden rounded-[30px] border border-white/[0.09] bg-[#0a0d16]/90 shadow-[0_40px_120px_rgba(0,0,0,.5)] backdrop-blur-xl lg:grid lg:grid-cols-[.9fr_1.1fr]">
        <aside className="relative hidden overflow-hidden border-r border-white/[0.08] bg-[linear-gradient(145deg,rgba(124,58,237,.14),rgba(7,9,18,.1))] p-10 lg:flex lg:flex-col">
          <div className="absolute -left-16 top-1/3 size-64 rounded-full bg-violet-500/15 blur-3xl" />
          <div className="absolute -right-24 bottom-0 size-64 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="relative">
            <Brand />
          </div>
          <div className="relative my-auto py-16">
            <span className="grid size-12 place-items-center rounded-2xl border border-violet-300/15 bg-violet-300/[0.08] text-violet-200">
              <Icon name="sparkles" />
            </span>
            <h2 className="mt-6 max-w-sm text-4xl font-semibold leading-tight tracking-[-0.04em] text-white">
              Create remarkable media from one workspace.
            </h2>
            <p className="mt-4 max-w-sm text-sm leading-6 text-slate-500">
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
                  className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3 text-center"
                >
                  <Icon
                    name={icon as "image" | "video" | "voice"}
                    className="mx-auto size-4 text-slate-400"
                  />
                  <p className="mt-2 text-[10px] font-semibold text-slate-500">
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <p className="relative text-[10px] text-slate-700">
            Private platform · Aiwa Media Group · Oman
          </p>
        </aside>

        <section className="p-6 sm:p-10 lg:p-12">
          <div className="mb-9 flex items-center justify-between lg:hidden">
            <Brand />
            <Link
              href="/"
              className="text-xs font-medium text-slate-600 hover:text-slate-300"
            >
              Home
            </Link>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-violet-300">
            {eyebrow}
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-white sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-slate-500">
            {description}
          </p>

          <div className="mt-8">{children}</div>

          <p className="mt-7 border-t border-white/[0.08] pt-6 text-center text-xs text-slate-600">
            {footerText}{" "}
            <Link
              href={footerHref}
              className="font-semibold text-violet-300 transition hover:text-violet-200"
            >
              {footerLabel}
            </Link>
          </p>

          <div className="mt-5 flex items-center justify-center gap-2 text-[10px] text-slate-700">
            <span className="size-1.5 rounded-full bg-emerald-400" /> Email and
            password access only
          </div>
        </section>
      </div>
    </main>
  );
}
