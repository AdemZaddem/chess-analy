import { Chess } from "chess.js";
import { sideToMove } from "@/lib/engine/chess-moves";
import type { EngineEvaluation, EngineScore, EngineWdl } from "@/lib/engine/types";
import type { Color, ExpectedPointsConfig, PositionEvaluation } from "./types";

type EvaluationLike = EngineEvaluation | PositionEvaluation;

export function clampExpectedPoints(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

function scoreOf(evaluation: EvaluationLike): EngineScore {
  return "evaluation" in evaluation ? evaluation.evaluation : evaluation.score;
}

/** Expected score for the side to move from UCI_ShowWDL per-mille counts. */
export function expectedPointsFromWdl(wdl: EngineWdl): number {
  const total = wdl.win + wdl.draw + wdl.loss;
  if (!Number.isFinite(total) || total <= 0) return 0.5;
  return clampExpectedPoints((wdl.win + wdl.draw * 0.5) / total);
}

/**
 * Documented fallback when WDL is unavailable:
 *   expected = 1 / (1 + exp(-slope * whiteCentipawns))
 * The default slope approximates Stockfish WDL around small advantages
 * (+29 cp is about 0.527 expected points). It is configurable in settings.
 */
export function centipawnExpectedPoints(
  whiteCentipawns: number,
  config: ExpectedPointsConfig,
): number {
  if (!Number.isFinite(whiteCentipawns)) return 0.5;
  const slope = Number.isFinite(config.centipawnSlope) && config.centipawnSlope > 0
    ? config.centipawnSlope
    : 0.00368208;
  const bounded = Math.min(100_000, Math.max(-100_000, whiteCentipawns));
  if (bounded >= 0) {
    return clampExpectedPoints(1 / (1 + Math.exp(-slope * bounded)));
  }
  const positive = Math.exp(slope * bounded);
  return clampExpectedPoints(positive / (1 + positive));
}

/** Converts a position evaluation to White's expected points in [0, 1]. */
export function whiteExpectedPoints(
  evaluation: EvaluationLike,
  config: ExpectedPointsConfig,
): number {
  const turn = sideToMove(evaluation.fen);

  if (config.useEngineWdl && evaluation.wdl) {
    const sideToMoveExpected = expectedPointsFromWdl(evaluation.wdl);
    return turn === "w"
      ? sideToMoveExpected
      : clampExpectedPoints(1 - sideToMoveExpected);
  }

  const score = scoreOf(evaluation);
  if (score.kind === "mate") {
    if (score.mate === undefined || !Number.isFinite(score.mate)) return 0.5;
    if (score.mate > 0) return 1;
    if (score.mate < 0) return 0;
    // UCI mate 0 means the side to move is mated. Keep decisive results exact.
    try {
      if (new Chess(evaluation.fen).isCheckmate()) {
        return turn === "w" ? 0 : 1;
      }
    } catch {
      // An invalid FEN should never produce a fabricated decisive score.
    }
    return 0.5;
  }

  if (score.centipawns === undefined) return 0.5;
  return centipawnExpectedPoints(score.centipawns, config);
}

/** Converts White's expected points to any player's expected points. */
export function expectedPointsForPlayer(
  whiteExpected: number,
  player: Color,
): number {
  const clamped = clampExpectedPoints(whiteExpected);
  return player === "w" ? clamped : clampExpectedPoints(1 - clamped);
}

/** Positive loss means the mover made the position worse for themselves. */
export function expectedPointsLoss(
  expectedBefore: number,
  expectedAfter: number,
): number {
  const before = clampExpectedPoints(expectedBefore);
  const after = clampExpectedPoints(expectedAfter);
  if (!Number.isFinite(before) || !Number.isFinite(after)) return 0;
  return clampExpectedPoints(Math.max(0, before - after));
}
