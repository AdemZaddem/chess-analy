/**
 * Phase 5 presentation helpers for Phase 4 evaluation data.
 *
 * No new evaluation system is introduced here: every value comes from an
 * existing `PositionEvaluation`. The graph and the evaluation bar both use
 * `evaluationPlotValue`, so they cannot disagree about colour or scaling.
 */
import type {
  FullGameAnalysis,
  MoveClassification,
  PositionEvaluation,
} from "@/lib/analysis/types";

/** Evaluation is linear inside this range, in pawns from White's side. */
export const EVAL_LINEAR_LIMIT = 4;
/** Hard ceiling for plotted centipawn evaluations, in pawns. */
export const EVAL_SATURATION_LIMIT = 10;
/** Mate positions are plotted just below the ceiling and marked distinctly. */
export const MATE_PLOT_VALUE = 9.5;

/**
 * Smooth saturation for large centipawn scores:
 *   |v| <= 4: linear
 *   |v| >  4: 4 + 6 * (1 - exp(-(|v| - 4) / 6))
 * Values are bounded to [-10, +10], so mate and huge scores never stretch the
 * axis. Small advantages (the majority of a game) stay undistorted.
 */
export function saturateEvaluation(whitePawns: number): number {
  if (!Number.isFinite(whitePawns)) return 0;
  const magnitude = Math.abs(whitePawns);
  if (magnitude <= EVAL_LINEAR_LIMIT) {
    return Math.min(EVAL_LINEAR_LIMIT, Math.max(-EVAL_LINEAR_LIMIT, whitePawns));
  }
  const saturated =
    EVAL_LINEAR_LIMIT +
    (EVAL_SATURATION_LIMIT - EVAL_LINEAR_LIMIT) *
      (1 - Math.exp(-(magnitude - EVAL_LINEAR_LIMIT) / EVAL_LINEAR_LIMIT));
  return Math.sign(whitePawns) * Math.min(EVAL_SATURATION_LIMIT, saturated);
}

/** Compact mate label. Engine mate scores count plies; notation counts moves. */
export function mateLabel(mate: number): string {
  if (!Number.isFinite(mate)) return "—";
  const moves = Math.max(1, Math.ceil(Math.abs(mate) / 2));
  return `${mate > 0 ? "M" : "-M"}${moves}`;
}

/** Shared plotting value for the graph and the evaluation bar. */
export function evaluationPlotValue(evaluation: PositionEvaluation | null | undefined): number {
  if (!evaluation) return 0;
  if (evaluation.score.kind === "mate") {
    const mate = evaluation.mate ?? evaluation.score.mate ?? 0;
    return mate >= 0 ? MATE_PLOT_VALUE : -MATE_PLOT_VALUE;
  }
  if (evaluation.whiteEvaluation === null || evaluation.whiteEvaluation === undefined) {
    return 0;
  }
  return saturateEvaluation(evaluation.whiteEvaluation);
}

/** Short, honest label for a position: mate indicators remain distinct. */
export function evaluationGraphLabel(evaluation: PositionEvaluation | null | undefined): string {
  if (!evaluation) return "—";
  if (evaluation.score.kind === "mate") {
    return mateLabel(evaluation.mate ?? evaluation.score.mate ?? 0);
  }
  if (evaluation.whiteEvaluation === null || evaluation.whiteEvaluation === undefined) {
    return "—";
  }
  const pawns = evaluation.whiteEvaluation;
  const rounded = pawns.toFixed(1).replace(/\.0$/, "");
  return `${pawns > 0 ? "+" : ""}${rounded}`;
}

/** Fraction of the bar owned by White, from the shared plotting value. */
export function whiteBarShare(evaluation: PositionEvaluation | null | undefined): number {
  const plot = evaluationPlotValue(evaluation);
  return Math.min(1, Math.max(0, 0.5 + plot / (2 * EVAL_SATURATION_LIMIT)));
}

export interface GraphPoint {
  ply: number;
  fen: string;
  san?: string;
  /** Raw White-perspective pawns; null for mate or missing evaluations. */
  whitePawns: number | null;
  /** Saturated value on the fixed [-10, +10] plotting axis. */
  plotValue: number;
  isMate: boolean;
  mate: number | null;
  label: string;
  classification?: MoveClassification;
  hasEvaluation: boolean;
  uncertain: boolean;
}

/**
 * Builds one point for the initial position and every analyzed ply. Missing
 * positions are kept as empty points so the x-axis still matches the game.
 */
export function buildEvaluationGraph(
  analysis: FullGameAnalysis | null | undefined,
): GraphPoint[] {
  if (!analysis || analysis.positions.length === 0) return [];

  const byPly = new Map(analysis.positions.map((position) => [position.ply, position]));
  const movesByPly = new Map((analysis.moves ?? []).map((move) => [move.ply, move]));
  const plies = analysis.positions.map((position) => position.ply);

  return plies.map((ply) => {
    const position = byPly.get(ply);
    const evaluation = position?.evaluation;
    const move = movesByPly.get(ply);
    const isMate = evaluation?.score.kind === "mate";
    const mate = isMate ? (evaluation?.mate ?? evaluation?.score.mate ?? null) : null;

    return {
      ply,
      fen: position?.fen ?? "",
      ...(move ? { san: move.san, classification: move.classification } : {}),
      whitePawns:
        evaluation && !isMate && evaluation.whiteEvaluation !== null
          ? evaluation.whiteEvaluation
          : null,
      plotValue: evaluationPlotValue(evaluation),
      isMate,
      mate,
      label: evaluationGraphLabel(evaluation),
      hasEvaluation: Boolean(evaluation),
      uncertain: evaluation ? evaluation.uncertain : true,
    };
  });
}
