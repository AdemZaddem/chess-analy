/**
 * Key moments are selected from existing Phase 4 results only. Every moment
 * has a qualifying rule and a numeric magnitude; empty categories stay empty.
 */
import type { FullGameAnalysis, MoveAnalysis } from "@/lib/analysis/types";
import {
  describeEvaluationSwing,
  describeMoveClassification,
} from "./explanations";

export type KeyMomentKind =
  | "blunder"
  | "missedWin"
  | "brilliant"
  | "swing"
  | "defensive";

export interface KeyMoment {
  id: string;
  kind: KeyMomentKind;
  label: string;
  detail: string;
  ply: number;
  move: MoveAnalysis;
  magnitude: number;
  priority: number;
}

function playerLabel(color: "w" | "b"): string {
  return color === "w" ? "White" : "Black";
}

function swingOf(move: MoveAnalysis): number {
  const before = move.positionBefore?.expectedPointsWhite;
  const after = move.positionAfter?.expectedPointsWhite;
  if (before === undefined || after === undefined) return 0;
  return Math.abs(after - before);
}

function strongestOf(moves: MoveAnalysis[]): MoveAnalysis | undefined {
  return [...moves].sort((a, b) => b.expectedPointsAfter - a.expectedPointsAfter)[0];
}

/**
 * Builds a small, deterministic set of review highlights. Categories are
 * considered in priority order and a ply is never reported twice.
 */
export function buildKeyMoments(
  analysis: FullGameAnalysis | null | undefined,
  limit = 6,
): KeyMoment[] {
  if (!analysis || analysis.moves.length === 0) return [];
  const moves = analysis.moves;
  const used = new Set<number>();
  const moments: KeyMoment[] = [];

  function add(move: MoveAnalysis, kind: KeyMomentKind, label: string, detail: string, magnitude: number, priority: number) {
    if (used.has(move.ply)) return;
    used.add(move.ply);
    moments.push({
      id: `${kind}-${move.ply}`,
      kind,
      label,
      detail,
      ply: move.ply,
      move,
      magnitude,
      priority,
    });
  }

  const blunder = moves
    .filter((move) => move.classification === "blunder")
    .sort((a, b) => b.expectedPointsLoss - a.expectedPointsLoss)[0];
  if (blunder) {
    add(
      blunder,
      "blunder",
      "Biggest blunder",
      describeMoveClassification(blunder),
      blunder.expectedPointsLoss,
      10,
    );
  }

  const missedWins = moves.filter((move) => move.classification === "missedWin");
  const missedWin = [...missedWins].sort(
    (a, b) => b.expectedPointsLoss - a.expectedPointsLoss,
  )[0];
  if (missedWin) {
    add(
      missedWin,
      "missedWin",
      "Missed win",
      describeMoveClassification(missedWin),
      missedWin.expectedPointsLoss,
      9,
    );
  }

  const brilliant = strongestOf(moves.filter((move) => move.classification === "brilliant"));
  if (brilliant) {
    add(
      brilliant,
      "brilliant",
      "Brilliant move",
      describeMoveClassification(brilliant),
      brilliant.expectedPointsAfter,
      8,
    );
  }

  const biggestSwing = [...moves]
    .filter((move) => !used.has(move.ply))
    .sort((a, b) => swingOf(b) - swingOf(a))[0];
  if (biggestSwing && swingOf(biggestSwing) > 0) {
    add(
      biggestSwing,
      "swing",
      "Largest evaluation swing",
      describeEvaluationSwing(
        biggestSwing.positionBefore.expectedPointsWhite,
        biggestSwing.positionAfter.expectedPointsWhite,
      ),
      swingOf(biggestSwing),
      7,
    );
  }

  const defensive = moves
    .filter(
      (move) =>
        !used.has(move.ply) &&
        move.expectedPointsBefore < 0.45 &&
        move.expectedPointsLoss <= 0.05 &&
        (move.classification === "best" ||
          move.classification === "great" ||
          move.classification === "excellent"),
    )
    .sort((a, b) => b.expectedPointsAfter - a.expectedPointsAfter)[0];
  if (defensive) {
    add(
      defensive,
      "defensive",
      "Critical defensive move",
      `${playerLabel(defensive.color)} kept the position steady with ${defensive.san} in a difficult moment.`,
      defensive.expectedPointsAfter - defensive.expectedPointsBefore,
      6,
    );
  }

  return moments
    .sort((a, b) => b.priority - a.priority || b.magnitude - a.magnitude)
    .slice(0, Math.max(0, limit));
}

/** Largest expected-points losses, grounded in the analyzed moves. */
export function biggestMistakes(analysis: FullGameAnalysis | null | undefined, limit = 3): MoveAnalysis[] {
  if (!analysis) return [];
  return [...analysis.moves]
    .filter((move) => move.expectedPointsLoss > 0)
    .sort((a, b) => b.expectedPointsLoss - a.expectedPointsLoss)
    .slice(0, limit);
}

/** Strongest moves by expected points achieved with minimal loss. */
export function strongestMoves(analysis: FullGameAnalysis | null | undefined, limit = 3): MoveAnalysis[] {
  if (!analysis) return [];
  return [...analysis.moves]
    .filter(
      (move) =>
        move.expectedPointsLoss <= 0.05 &&
        (move.classification === "best" ||
          move.classification === "great" ||
          move.classification === "excellent" ||
          move.classification === "brilliant"),
    )
    .sort(
      (a, b) =>
        b.expectedPointsAfter - a.expectedPointsAfter ||
        a.expectedPointsLoss - b.expectedPointsLoss,
    )
    .slice(0, limit);
}
