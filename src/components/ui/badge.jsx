import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-none border font-display uppercase tracking-widest transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        default:
          "border-[#D8CA82]/40 text-[#D8CA82] bg-[#D8CA82]/10",
        gold:
          "border-[#D8CA82]/40 text-[#D8CA82] bg-[#D8CA82]/10",
        outline:
          "border-white/15 text-[#f7f7f7]/70 bg-transparent",
        subtle:
          "border-white/10 bg-white/5 text-[#f7f7f7]/60",
        destructive:
          "border-red-400/50 text-red-300 bg-red-500/10",
        danger:
          "border-red-400/50 text-red-300 bg-red-500/10",
        success:
          "border-emerald-300/40 text-emerald-300 bg-emerald-500/10",
        warning:
          "border-orange-300/40 text-orange-300 bg-orange-500/10",
        eva:
          "border-[#D8CA82]/30 text-[#D8CA82]/80 bg-[#D8CA82]/5",
        rl:
          "border-[#F4511E]/50 text-[#F4511E] bg-[#F4511E]/10",
        valo:
          "border-[#FF4655]/50 text-[#FF4655] bg-[#FF4655]/10",
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
