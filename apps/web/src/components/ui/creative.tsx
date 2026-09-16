import type { ElementType, HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

type SurfaceProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  children: ReactNode;
  variant?: "plain" | "sketch" | "sunken";
};

export function CreativeSurface({
  as: Component = "div",
  children,
  className,
  variant = "plain",
  ...props
}: SurfaceProps) {
  return (
    <Component
      className={cn(
        "rounded-xl border border-border text-card-foreground",
        variant === "plain" && "bg-card shadow-sm",
        variant === "sketch" && "sketch-card",
        variant === "sunken" && "bg-surface-sunken",
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
}

export function Eyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "font-mono text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-primary",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function Annotation({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-hand inline-flex -rotate-2 text-xl font-semibold text-primary",
        className,
      )}
    >
      {children}
    </span>
  );
}
