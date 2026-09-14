import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

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
    <main className="grid min-h-screen place-items-center px-4 py-12 sm:px-6">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mx-auto mb-8 flex w-fit items-center gap-3 text-white"
        >
          <span className="grid size-10 place-items-center rounded-xl bg-cyan-300 font-black text-slate-950">
            A
          </span>
          <span>
            <span className="block text-sm font-bold tracking-wide">
              AIWA CREATORS
            </span>
            <span className="block text-xs text-slate-500">
              Creative intelligence workspace
            </span>
          </span>
        </Link>

        <section className="rounded-3xl border border-white/10 bg-slate-950/75 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">
            {eyebrow}
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white">
            {title}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">{description}</p>

          <div className="mt-7">{children}</div>

          <p className="mt-7 border-t border-white/10 pt-6 text-center text-sm text-slate-500">
            {footerText}{" "}
            <Link
              href={footerHref}
              className="font-semibold text-cyan-300 hover:text-cyan-200"
            >
              {footerLabel}
            </Link>
          </p>
        </section>

        <p className="mt-5 text-center text-xs leading-5 text-slate-600">
          Email and password access only. Additional identity providers are not
          enabled.
        </p>
      </div>
    </main>
  );
}
