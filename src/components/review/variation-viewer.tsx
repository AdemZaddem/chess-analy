"use client";

import { ArrowLeft, ChevronLeft, ChevronRight, GitBranch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { VariationState } from "@/hooks/use-variation";
import { formatVariationSan } from "@/lib/review/variation";

/**
 * Displays the validated engine line. Navigation changes only the overlay in
 * `useVariation`; the imported game and its history are never modified.
 */
export function VariationViewer({
  variation,
  playedSan,
}: {
  variation: VariationState;
  playedSan?: string;
}) {
  const moves = variation.line.moves;
  if (moves.length === 0) return null;

  const fullmove = Number.parseInt(variation.baseFen.split(/\s+/)[5] ?? "1", 10);
  const firstColor = variation.baseFen.split(/\s+/)[1] === "b" ? "b" : "w";
  const startNumber = Number.isFinite(fullmove) ? fullmove : 1;

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2 py-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <GitBranch className="size-4 text-violet" aria-hidden />
          Engine variation
        </CardTitle>
        <Badge variant={variation.isActive ? "violet" : "neutral"}>
          {variation.isActive ? `Ply ${variation.index} of ${moves.length}` : "Preview"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3 p-3 sm:p-4">
        {playedSan ? (
          <p className="text-[11px] text-muted">
            Played: <span className="font-mono text-ink">{playedSan}</span> ·
            Engine line below starts from the current position and was not played.
          </p>
        ) : null}
        <div className="flex flex-wrap items-start gap-1.5 font-mono text-xs">
          {moves.map((move, index) => {
            const isWhite = firstColor === "w" ? index % 2 === 0 : index % 2 === 1;
            const number = startNumber + Math.floor((index + (firstColor === "b" ? 1 : 0)) / 2);
            return (
              <span key={move.uci} className="flex items-center gap-1.5">
                {isWhite ? <span className="text-muted">{number}.</span> : null}
                <button
                  type="button"
                  onClick={() => variation.goTo(index + 1)}
                  aria-current={variation.index === index + 1 ? "step" : undefined}
                  aria-label={`Variation move ${number}${isWhite ? "" : "..."} ${move.san}`}
                  className={`rounded px-1.5 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 ${
                    variation.index === index + 1
                      ? "bg-violet/25 font-semibold text-violet"
                      : "text-ink hover:bg-surface-3"
                  }`}
                >
                  {move.san}
                </button>
              </span>
            );
          })}
        </div>

        {variation.line.rejectedAt !== null ? (
          <p className="rounded-lg border border-amber-400/20 bg-amber-400/10 p-2 text-[11px] text-amber-100/90">
            Line stopped after move {variation.line.rejectedAt - 1}: the next engine token was not legal here.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={variation.previous}
            disabled={variation.index === 0}
          >
            <ChevronLeft className="size-4" aria-hidden />
            Previous
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={variation.next}
            disabled={variation.index >= moves.length}
          >
            <ChevronRight className="size-4" aria-hidden />
            Next
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={variation.exit}
            disabled={!variation.isActive}
          >
            <ArrowLeft className="size-4" aria-hidden />
            Return to game
          </Button>
          {!variation.isActive ? (
            <Button type="button" variant="primary" size="sm" onClick={variation.enter}>
              Step into line
            </Button>
          ) : null}
        </div>

        <p className="text-[11px] text-muted">
          {formatVariationSan(moves, variation.baseFen)}
        </p>
      </CardContent>
    </Card>
  );
}
