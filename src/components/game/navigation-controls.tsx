"use client";

import {
  ChevronLeft,
  ChevronRight,
  Keyboard,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MoveRecord } from "@/lib/chess/types";

export function NavigationControls({
  currentMove,
  currentPly,
  moveCount,
  isAtStart,
  isAtEnd,
  onFirst,
  onPrevious,
  onNext,
  onLast,
}: {
  currentMove?: MoveRecord;
  currentPly: number;
  moveCount: number;
  isAtStart: boolean;
  isAtEnd: boolean;
  onFirst: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onLast: () => void;
}) {
  const label = currentMove
    ? `Move ${currentMove.moveNumber}${currentMove.color === "b" ? "…" : "."} · ${currentMove.san}`
    : "Starting position";

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line-soft bg-canvas/50 px-3 py-2.5">
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={onFirst}
          disabled={isAtStart}
          aria-label="Jump to start"
          title="Jump to start (Home)"
        >
          <SkipBack className="size-4" aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onPrevious}
          disabled={isAtStart}
          aria-label="Previous move"
          title="Previous move (Left arrow)"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onNext}
          disabled={isAtEnd}
          aria-label="Next move"
          title="Next move (Right arrow)"
        >
          <ChevronRight className="size-4" aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onLast}
          disabled={isAtEnd}
          aria-label="Jump to final position"
          title="Jump to final position (End)"
        >
          <SkipForward className="size-4" aria-hidden />
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <span className="hidden items-center gap-1.5 text-xs text-muted sm:flex">
          <Keyboard className="size-3.5" aria-hidden />
          Arrow keys
        </span>
        <span className="font-mono text-xs text-ink">{label}</span>
        <span className="text-xs text-muted">
          {currentPly}/{moveCount}
        </span>
      </div>
    </div>
  );
}
