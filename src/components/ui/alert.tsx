import { AlertCircle } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

export function ErrorAlert({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex gap-3 rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-100",
        className,
      )}
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-300" aria-hidden />
      <p className="leading-relaxed">{children}</p>
    </div>
  );
}
