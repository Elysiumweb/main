import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  // ELYSIUM design system: blade-cut corners, Orbitron labels, gold or frame.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none font-display uppercase tracking-widest transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "clip-blade-sm bg-gold text-primary-foreground font-bold hover:shadow-[0_0_20px_oklch(0.84_0.095_98/0.4)] u-micro-shadow",
        gold:
          "clip-blade-sm bg-gold text-primary-foreground font-bold hover:shadow-[0_0_20px_oklch(0.84_0.095_98/0.4)] u-micro-shadow",
        primary:
          "clip-blade-sm bg-gold text-primary-foreground font-bold hover:shadow-[0_0_20px_oklch(0.84_0.095_98/0.4)] u-micro-shadow",
        outline:
          "clip-blade-sm border border-primary/50 text-primary hover:border-primary hover:bg-primary/10 u-micro",
        frame:
          "clip-blade-sm border border-border/50 text-foreground/85 hover:border-primary hover:text-primary u-micro",
        secondary:
          "clip-blade-sm border border-border/40 bg-primary/5 text-foreground hover:bg-primary/10 hover:border-primary/50",
        destructive:
          "clip-blade-sm bg-red-500/15 border border-red-400/50 text-red-200 hover:bg-red-500/25 hover:text-red-100 font-bold",
        danger:
          "clip-blade-sm bg-red-500/15 border border-red-400/50 text-red-200 hover:bg-red-500/25 hover:text-red-100 font-bold",
        ghost: "text-foreground/70 hover:text-primary hover:bg-primary/5",
        link: "text-primary underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        default: "px-6 py-3 text-sm",
        md: "px-6 py-3 text-sm",
        lg: "px-8 py-4 text-sm font-bold",
        xl: "px-9 py-4 text-sm font-bold",
        sm: "px-4 py-2 text-xs",
        xs: "px-2.5 py-1 text-xs",
        icon: "h-9 w-9 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  );
});
Button.displayName = "Button";

export { Button, buttonVariants };
