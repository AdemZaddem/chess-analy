/**
 * Plain-language, display-only explanations derived from Phase 4 results.
 * They never add tactical claims that the engine did not provide.
 */
import { CLASSIFICATION_LABELS } from "@/lib/analysis/labels";
import type { MoveAnalysis, MoveClassification } from "@/lib/analysis/types";

const SIGNIFICANT: ReadonlySet<MoveClassification> = new Set([
  "brilliant",
  "great",
  "best",
  "inaccuracy",
  "mistake",
  "blunder",
  "missedWin",
]);

export function isSignificantClassification(
  classification: MoveClassification,
): boolean {
  return SIGNIFICANT.has(classification);
}

function side(move: MoveAnalysis): string {
  return move.color === "w" ? "White" : "Black";
}

function alternative(move: MoveAnalysis): string {
  if (move.isBestMove) return "";
  const best = move.bestMoveSan;
  return best ? ` The engine preferred ${best}.` : " The engine preferred a different move.";
}

/** Human-readable reason for a classified move, grounded only in existing data. */
export function describeMoveClassification(move: MoveAnalysis): string {
  const player = side(move);
  switch (move.classification) {
    case "missedWin":
      return `${player} had a winning position, but this move let the chance slip.${alternative(move)}`;
    case "blunder":
      return `This sharply reduced ${player}'s chances.${alternative(move)}`;
    case "mistake":
      return `This clearly reduced ${player}'s chances.${alternative(move)}`;
    case "inaccuracy":
      return `This slightly reduced ${player}'s chances.${alternative(move)}`;
    case "brilliant":
      return `${player} found the engine's top move and kept a strong position.`;
    case "great":
      return `${player} found a strong move in a difficult position and improved the outcome.`;
    case "best":
      return move.isForced
        ? "It was the only legal move, so there was no alternative to compare."
        : "This matched the engine's top move.";
    case "excellent":
      return `This kept ${player}'s position steady with very little loss.`;
    case "good":
      return `The move was playable, but it did not stand out in the engine's evaluation.`;
    case "book":
      return "This is an opening move; no move-by-move opening database is available locally.";
  }
}

/** Short classification context, for example "Blunder — Black played g6". */
export function moveClassificationContext(move: MoveAnalysis): string {
  const meta = CLASSIFICATION_LABELS[move.classification];
  return `${meta.label} — ${side(move)} played ${move.san}`;
}

function balance(expectedPointsWhite: number): string {
  if (!Number.isFinite(expectedPointsWhite)) return "the position was unclear";
  if (expectedPointsWhite >= 0.8) return "White was clearly better";
  if (expectedPointsWhite >= 0.55) return "White was better";
  if (expectedPointsWhite >= 0.4) return "White was slightly better";
  if (expectedPointsWhite <= 0.2) return "Black was clearly better";
  if (expectedPointsWhite <= 0.45) return "Black was slightly better";
  return "the position was roughly level";
}

/** Plain-language description of an expected-points swing. */
export function describeEvaluationSwing(before: number, after: number): string {
  return `The balance shifted from ${balance(before)} to ${balance(after)}.`;
}
