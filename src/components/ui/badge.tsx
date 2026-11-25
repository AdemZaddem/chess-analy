import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wide",
  {
    variants: {
      variant: {
        neutral: "border-line bg-surface-2 text-muted",
        success: "border-accent/30 bg-accent/10 text-accent",
        violet: "border-violet/30 bg-violet/10 text-violet",
        warning: "border-amber-400/30 bg-amber-400/10 text-amber-200",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
