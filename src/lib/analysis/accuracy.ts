import type { Color, GameAccuracy, MoveAnalysis, PlayerAccuracy } from "./types";

export const NO_MOVES_ACCURACY = 100;

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/**
 * Transparent metric inspired by Chess.com, not a reproduction of its
 * proprietary formula:
 *
 *   accuracy = 100 * (1 - totalExpectedPointsLoss / countedMoves)
 *
 * Forced moves are skipped. Mate and resignation are handled through the
 * expected-points value of the evaluated positions; no synthetic loss is added.
 */
export function calculatePlayerAccuracy(
  moves: MoveAnalysis[],
  color: Color,
): PlayerAccuracy {
  const playerMoves = moves.filter((move) => move.color === color);
  const counted = playerMoves.filter((move) => !move.isForced);
  const forcedMovesSkipped = playerMoves.length - counted.length;
  const totalExpectedPointsLoss = counted.reduce(
    (sum, move) => sum + move.expectedPointsLoss,
    0,
  );
  const averageExpectedPointsLoss = counted.length
    ? totalExpectedPointsLoss / counted.length
    : 0;

  return {
    color,
    accuracy: counted.length
      ? clampPercent(100 * (1 - averageExpectedPointsLoss))
      : NO_MOVES_ACCURACY,
    movesCounted: counted.length,
    forcedMovesSkipped,
    totalExpectedPointsLoss,
    averageExpectedPointsLoss,
  };
}

export function calculateGameAccuracy(moves: MoveAnalysis[]): GameAccuracy {
  return {
    white: calculatePlayerAccuracy(moves, "w"),
    black: calculatePlayerAccuracy(moves, "b"),
  };
}
