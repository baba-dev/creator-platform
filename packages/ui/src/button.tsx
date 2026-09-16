import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "./utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border border-transparent text-sm font-semibold transition-[transform,box-shadow,background-color,border-color,color] duration-200 ease-creative outline-none disabled:pointer-events-none disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-px",
  {
    variants: {
      variant: {
        default:
          "border-primary/20 bg-primary text-primary-foreground shadow-[0_8px_24px_color-mix(in_oklch,var(--primary)_24%,transparent)] hover:-translate-y-0.5 hover:bg-primary/92 hover:shadow-[0_12px_30px_color-mix(in_oklch,var(--primary)_30%,transparent)]",
        secondary:
          "border-border bg-card/72 text-foreground shadow-xs backdrop-blur-sm hover:-translate-y-0.5 hover:border-primary/30 hover:bg-secondary",
        ghost:
          "text-muted-foreground hover:bg-secondary/75 hover:text-foreground",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-9 rounded-sm px-3",
        lg: "h-12 px-6 text-base",
        icon: "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : "button";

  return (
    <Component
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { buttonVariants };
