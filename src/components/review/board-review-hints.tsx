"use client";

import { Badge } from "@/components/ui/badge";
import { CLASSIFICATION_LABELS } from "@/lib/analysis/labels";
import type { MoveAnalysis } from "@/lib/analysis/types";
import { BOARD_ANNOTATION_COLORS, type BoardAnnotations } from "@/lib/review/annotations";
import {
  describeMoveClassification,
  isSignificantClassification,
} from "@/lib/review/explanations";

const ARROW_LABELS: Record<string, string> = {
  [BOARD_ANNOTATION_COLORS.played]: "Played move",
  [BOARD_ANNOTATION_COLORS.engine]: "Engine choice",
  [BOARD_ANNOTATION_COLORS.variation]: "Variation step",
};

/**
 * Small board-adjacent hints. Classification text is shown only for moves that
 * already received a notable label, so ordinary moves do not become banners.
 */
export function BoardReviewHints({
  move,
  annotations,
  variationActive,
}: {
  move?: MoveAnalysis | null;
  annotations: BoardAnnotations;
  variationActive: boolean;
}) {
  const showClassification =
    !variationActive && !!move && isSignificantClassification(move.classification);
  const legendLabels = Array.from(
    new Set(annotations.arrows.map((arrow) => ARROW_LABELS[arrow.color]).filter(Boolean)),
  ) as string[];

  if (!showClassification && legendLabels.length === 0) return null;

  const meta = showClassification ? CLASSIFICATION_LABELS[move!.classification] : null;
  const player = move?.color === "b" ? "Black" : "White";

  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-line-soft bg-surface-2/50 px-2.5 py-1.5" data-testid="board-review-hints">
      {showClassification && meta ? (
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs" data-testid="selected-move-classification">
          <Badge variant={meta.tone}>
            {meta.symbol} {meta.label}
          </Badge>
          <span aria-hidden> — </span>
          <span className="min-w-0 leading-relaxed text-muted">
            <span className="font-medium text-ink">{player} played {move!.san}</span> —{" "}
            {describeMoveClassification(move!)}
          </span>
        </p>
      ) : null}
      {legendLabels.length ? (
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted" aria-label="Board arrow legend">
          {legendLabels.map((label) => {
            const color = Object.entries(ARROW_LABELS).find(([, value]) => value === label)?.[0];
            return (
              <li key={label} className="flex items-center gap-1.5">
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
                {label}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
