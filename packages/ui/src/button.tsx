import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "./utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-200 outline-none disabled:pointer-events-none disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 active:translate-y-px",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-violet-500 to-indigo-500 text-white shadow-[0_10px_30px_rgba(99,102,241,.22)] hover:from-violet-400 hover:to-indigo-400 hover:shadow-[0_12px_34px_rgba(99,102,241,.3)]",
        secondary:
          "border border-white/10 bg-white/[0.055] text-white shadow-sm hover:border-white/[0.16] hover:bg-white/[0.09]",
        ghost: "text-slate-400 hover:bg-white/[0.055] hover:text-white",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-9 rounded-lg px-3",
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
