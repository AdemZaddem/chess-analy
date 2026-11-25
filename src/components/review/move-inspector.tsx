"use client";

import { Badge } from "@/components/ui/badge";
import { CLASSIFICATION_LABELS } from "@/lib/analysis/labels";
import type { MoveAnalysis } from "@/lib/analysis/types";

function formatPv(moves: string[]): string {
  if (!moves.length) return "—";
  return moves
    .map((move, index) => (index % 2 === 0 ? `${Math.floor(index / 2) + 1}. ${move}` : move))
    .join(" ");
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(3)}`;
}

/** Move-specific facts are taken from Phase 4; no narrative is invented. */
export function MoveInspector({ move }: { move: MoveAnalysis | null | undefined }) {
  if (!move) {
    return (
      <div className="border-t border-line-soft pt-3">
        <p className="text-[11px] uppercase tracking-wider text-muted">Selected move</p>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Select a move in the move list or evaluation graph to inspect its analysis.
        </p>
      </div>
    );
  }

  const meta = CLASSIFICATION_LABELS[move.classification];
  const best = move.bestMoveSan ?? move.bestMove ?? "—";
  const change = move.expectedPointsAfter - move.expectedPointsBefore;
  const facts = [
    move.isCapture ? "capture" : null,
    move.isRecapture ? "recapture" : null,
    move.isPromotion ? "promotion" : null,
    move.isSacrifice ? "material commitment" : null,
    move.isForced ? "only legal move" : null,
  ].filter(Boolean);

  return (
    <div className="border-t border-line-soft pt-3" data-testid="move-inspector">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wider text-muted">Selected move</p>
        <Badge variant={meta.tone}>
          {meta.symbol} {meta.label}
        </Badge>
      </div>

      <div className="mt-2 space-y-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-ink">
            {move.san} <span className="text-muted">({move.uci})</span>
          </span>
          <span className="text-muted">
            {move.color === "w" ? "White" : "Black"} · move {move.moveNumber}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono">
          <span>Eval before: {move.positionBefore.score.label}</span>
          <span>Eval after: {move.positionAfter.score.label}</span>
          <span>Best: {best}</span>
          <span>Loss: {move.expectedPointsLoss.toFixed(3)}</span>
          <span>Change: {signed(change)}</span>
          <span>Depth: {move.depth}</span>
        </div>

        {!move.isBestMove && move.bestMove ? (
          <p className="leading-relaxed text-muted">
            The engine preferred {best} from the position before {move.san}.
          </p>
        ) : null}

        <p className="leading-relaxed text-muted">PV: {formatPv(move.principalVariationSan)}</p>
        <p className="font-mono text-[11px] text-muted">{formatPv(move.principalVariation)}</p>

        {move.classificationReasons.length ? (
          <p className="leading-relaxed text-muted">
            Engine detail: {move.classificationReasons.join(" · ")}
          </p>
        ) : null}

        {facts.length ? (
          <p className="text-[11px] text-muted">Engine data: {facts.join(" · ")}</p>
        ) : null}
      </div>
    </div>
  );
}
