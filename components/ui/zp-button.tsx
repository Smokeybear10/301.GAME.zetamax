import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Zetamax button. Three variants codify the existing visual language so every
 * site renders identically:
 *
 *   primary — solid white CTA. Dominant action on a screen. Sentence-case.
 *   secondary — outlined sibling next to a primary CTA. Sentence-case.
 *   chip — small mono uppercase utility nav (back links, in-card actions).
 *   floating — fixed-position rounded chip for drill screens (top-3/bottom-6 left).
 *
 * Use `asChild` to wrap a Next.js Link without nesting an anchor in a button.
 *
 * Sizes (compose with variant):
 *   default — primary/secondary at px-7 py-3 / chip at px-4 py-2.
 *   sm     — primary/secondary at px-4 py-2 (inline form actions); chip at px-3 py-1.5.
 */
const zpButtonVariants = cva(
  "inline-flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none",
  {
    variants: {
      variant: {
        primary:
          "bg-white text-black border border-white font-medium hover:bg-transparent hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black",
        secondary:
          "border border-white/15 text-white/65 hover:text-white hover:border-white focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-black",
        chip:
          "border border-white/10 hover:border-white/30 bg-white/[0.04] hover:bg-white/[0.08] text-white/65 hover:text-white font-mono tracking-[0.18em] uppercase focus-visible:ring-1 focus-visible:ring-white/30",
        floating:
          "fixed top-3 left-3 sm:top-auto sm:bottom-6 sm:left-6 gap-2 rounded-full border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/30 text-white/65 hover:text-white font-mono tracking-[0.28em] uppercase",
      },
      size: {
        default: "",
        sm: "",
      },
    },
    compoundVariants: [
      // primary / secondary sizing
      { variant: "primary", size: "default", className: "px-7 py-3 text-sm" },
      { variant: "primary", size: "sm", className: "px-4 py-2 text-xs" },
      { variant: "secondary", size: "default", className: "px-7 py-3 text-sm" },
      { variant: "secondary", size: "sm", className: "px-4 py-2 text-xs" },
      // chip sizing
      { variant: "chip", size: "default", className: "px-4 py-2 text-[11px]" },
      { variant: "chip", size: "sm", className: "px-3 py-1.5 text-[10px]" },
      // floating chip is always one size
      { variant: "floating", size: "default", className: "px-3 py-2 text-[11px]" },
      { variant: "floating", size: "sm", className: "px-3 py-2 text-[11px]" },
    ],
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface ZpButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof zpButtonVariants> {
  asChild?: boolean;
}

const ZpButton = React.forwardRef<HTMLButtonElement, ZpButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(zpButtonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
ZpButton.displayName = "ZpButton";

export { ZpButton, zpButtonVariants };
