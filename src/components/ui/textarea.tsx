import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full resize-y rounded-xl border border-line bg-canvas/70 px-4 py-3 font-mono text-xs leading-relaxed text-ink placeholder:text-muted/60 focus-visible:border-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export { Textarea };
