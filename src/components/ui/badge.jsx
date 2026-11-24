import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-none border font-display uppercase tracking-widest transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        default:
          "border-primary/40 text-primary bg-primary/10",
        gold:
          "border-primary/40 text-primary bg-primary/10",
        outline:
          "border-border/35 text-muted-foreground bg-transparent",
        subtle:
          "border-border/25 bg-primary/5 text-muted-foreground",
        destructive:
          "border-red-400/50 text-red-300 bg-red-500/10",
        danger:
          "border-red-400/50 text-red-300 bg-red-500/10",
        success:
          "border-emerald-300/40 text-emerald-300 bg-emerald-500/10",
        warning:
          "border-orange-300/40 text-orange-300 bg-orange-500/10",
        eva:
          "border-primary/30 text-primary/80 bg-primary/5",
        rl:
          "border-[#F4511E]/50 text-[#F4511E] bg-[#F4511E]/10",
      },
      size: {
        default: "px-2 py-0.5 text-xs",
        sm: "px-1.5 py-0.5 text-[8px]",
        md: "px-2.5 py-1 text-xs",
        lg: "px-3 py-1 text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Badge({ className, variant, size, ...props }) {
  return <span className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}

export { Badge, badgeVariants };
