import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PencilArrow({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn("overflow-visible text-primary", className)}
      viewBox="0 0 92 54"
      fill="none"
    >
      <path
        d="M3 8c18 3 28 13 39 25 9 10 20 11 40 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="1 1"
        pathLength="1"
        className="animate-draw"
      />
      <path
        d="m72 31 12 8-10 10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ScribbleOrbit({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn("overflow-visible text-primary", className)}
      viewBox="0 0 160 78"
      fill="none"
    >
      <path
        d="M153 39c0 18-31 33-71 33S7 58 7 39 38 6 80 6c37 0 68 12 73 27 5 14-21 30-56 35"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeDasharray="1 1"
        pathLength="1"
        className="animate-draw"
      />
    </svg>
  );
}

export function Tape({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute h-5 w-20 -rotate-3 bg-highlighter/55 shadow-xs [clip-path:polygon(2%_12%,98%_0,94%_88%,0_100%)]",
        className,
      )}
    />
  );
}

export function DemoBadge({
  children = "Demo preview",
}: {
  children?: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/20 bg-warning/10 px-2.5 py-1 font-mono text-[0.625rem] font-bold uppercase tracking-[0.12em] text-warning">
      <span className="size-1.5 rounded-full bg-warning" />
      {children}
    </span>
  );
}

export function StatusDot({
  children,
  tone = "success",
  className,
}: {
  children: ReactNode;
  tone?: "success" | "warning" | "info" | "primary";
  className?: string;
}) {
  const tones = {
    success: "border-success/20 bg-success/10 text-success before:bg-success",
    warning: "border-warning/20 bg-warning/10 text-warning before:bg-warning",
    info: "border-info/20 bg-info/10 text-info before:bg-info",
    primary: "border-primary/20 bg-primary/10 text-primary before:bg-primary",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 font-mono text-[0.625rem] font-bold uppercase tracking-[0.12em] before:size-1.5 before:rounded-full",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function RuledNote({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "ruled-paper relative rounded-xl border border-border bg-card p-5 shadow-sketch",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
