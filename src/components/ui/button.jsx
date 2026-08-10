import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none font-display uppercase tracking-widest transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D8CA82] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[#D8CA82] text-[#111111] font-bold hover:shadow-[0_0_20px_rgba(216,202,130,0.35)] u-micro-shadow",
        gold:
          "bg-[#D8CA82] text-[#111111] font-bold hover:shadow-[0_0_20px_rgba(216,202,130,0.35)] u-micro-shadow",
        primary:
          "bg-[#D8CA82] text-[#111111] font-bold hover:shadow-[0_0_20px_rgba(216,202,130,0.35)] u-micro-shadow",
        outline:
          "border border-white/20 text-[#f7f7f7] hover:border-[#D8CA82] hover:text-[#D8CA82] u-micro",
        secondary:
          "border border-white/15 bg-white/5 text-[#f7f7f7] hover:bg-white/10 hover:border-[#D8CA82]/50",
        destructive:
          "bg-red-500/15 border border-red-400/50 text-red-200 hover:bg-red-500/25 hover:text-red-100 font-bold",
        danger:
          "bg-red-500/15 border border-red-400/50 text-red-200 hover:bg-red-500/25 hover:text-red-100 font-bold",
        ghost: "text-[#f7f7f7]/70 hover:text-[#D8CA82] hover:bg-white/5",
        link: "text-[#D8CA82] underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        default: "px-6 py-3 text-sm",
        md: "px-6 py-3 text-sm",
        lg: "px-8 py-4 text-sm font-bold",
        sm: "px-4 py-2 text-xs",
        xs: "px-2.5 py-1 text-[10px]",
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
