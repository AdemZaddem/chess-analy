import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        primary:
          "bg-accent font-semibold text-emerald-950 shadow-[0_10px_30px_-14px_var(--color-accent)] hover:bg-emerald-300",
        secondary:
          "border border-line bg-surface-2 text-ink hover:border-accent/40 hover:bg-surface-3",
        outline:
          "border border-line bg-transparent text-ink hover:bg-surface-2",
        ghost: "text-muted hover:bg-surface-2 hover:text-ink",
        danger:
          "border border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4",
        lg: "h-12 px-6",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Component = asChild ? Slot : "button";
    return (
      <Component
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
