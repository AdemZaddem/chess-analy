"use client";

import type { PositionEvaluation } from "@/lib/analysis/types";
import { mateLabel, whiteBarShare } from "@/lib/review/evaluation";

/**
 * Vertical evaluation bar adjacent to the board. It consumes the same
 * `PositionEvaluation` and plotting value as the evaluation graph.
 */
export function EvaluationBar({
  evaluation,
  orientation,
}: {
  evaluation: PositionEvaluation | null | undefined;
  orientation: "white" | "black";
}) {
  const hasEvaluation = Boolean(evaluation);
  const whiteShare = hasEvaluation ? whiteBarShare(evaluation) : 0.5;
  const whitePercent = Math.round(whiteShare * 100);
  const isMate = evaluation?.score.kind === "mate";
  const mate = isMate ? (evaluation?.mate ?? evaluation?.score.mate ?? 0) : 0;
  const mateText = isMate ? mateLabel(mate) : null;
  const label = hasEvaluation
    ? isMate
      ? `${mate > 0 ? "White" : "Black"} mates · ${mateText}`
      : `White ${whitePercent}%, Black ${100 - whitePercent}%`
    : "Evaluation unavailable";

  const whiteFirst = orientation === "black";
  const whiteStyle = { height: `${whitePercent}%` };
  const blackStyle = { height: `${100 - whitePercent}%` };

  return (
    <div
      className="relative flex h-full w-4 flex-col overflow-hidden rounded-md border border-line bg-[#19342b] sm:w-5"
      role="meter"
      aria-label="Position evaluation, White advantage"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={hasEvaluation ? whitePercent : 50}
      aria-valuetext={label}
      data-testid="evaluation-bar"
    >
      {whiteFirst ? (
        <>
          <div className="flex items-center justify-center bg-[#dce9df] text-[8px] font-bold text-emerald-950" style={whiteStyle}>
            {mateText && mate > 0 ? mateText : null}
          </div>
          <div className="flex flex-1 items-center justify-center bg-[#19342b] text-[8px] font-bold text-emerald-200" style={blackStyle}>
            {mateText && mate < 0 ? mateText : null}
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-1 items-center justify-center bg-[#19342b] text-[8px] font-bold text-emerald-200" style={blackStyle}>
            {mateText && mate < 0 ? mateText : null}
          </div>
          <div className="flex items-center justify-center bg-[#dce9df] text-[8px] font-bold text-emerald-950" style={whiteStyle}>
            {mateText && mate > 0 ? mateText : null}
          </div>
        </>
      )}
      {!hasEvaluation ? (
        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] text-ink/60" aria-hidden>
          —
        </span>
      ) : null}
    </div>
  );
}
