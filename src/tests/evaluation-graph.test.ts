import { describe, expect, it } from "vitest";
import {
  buildEvaluationGraph,
  evaluationGraphLabel,
  evaluationPlotValue,
  EVAL_LINEAR_LIMIT,
  EVAL_SATURATION_LIMIT,
  MATE_PLOT_VALUE,
  mateLabel,
  saturateEvaluation,
  whiteBarShare,
} from "@/lib/review/evaluation";
import {
  createScriptedEngine,
  fakePositionEvaluation,
  gameFromPgn,
  makeEngineEvaluation,
} from "./full-game-test-helpers";
import { buildGamePositions } from "@/lib/analysis/positions";
import { FullGameAnalysisRunner } from "@/lib/analysis/full-game-service";
import { createAnalysisSettings } from "@/lib/analysis/settings";
import { STANDARD_PGN } from "./fixtures";

describe("evaluation presentation helpers", () => {
  it("keeps small centipawn advantages linear", () => {
    expect(saturateEvaluation(0)).toBe(0);
    expect(saturateEvaluation(1.5)).toBe(1.5);
    expect(saturateEvaluation(-EVAL_LINEAR_LIMIT)).toBe(-EVAL_LINEAR_LIMIT);
  });

  it("saturates large centipawn evaluations without changing sign", () => {
    expect(saturateEvaluation(12)).toBeGreaterThan(EVAL_LINEAR_LIMIT);
    expect(saturateEvaluation(12)).toBeLessThan(EVAL_SATURATION_LIMIT);
    expect(saturateEvaluation(-12)).toBeCloseTo(-saturateEvaluation(12));
    expect(saturateEvaluation(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("plots mate distinctly and uses the same value for the bar", () => {
    const whiteMate = fakePositionEvaluation(1, {
      score: { kind: "mate", mate: 4, label: "White mates in 4" },
      centipawns: null,
      mate: 4,
      whiteEvaluation: null,
    });
    const blackMate = fakePositionEvaluation(0, {
      score: { kind: "mate", mate: -3, label: "Black mates in 3" },
      centipawns: null,
      mate: -3,
      whiteEvaluation: null,
    });

    expect(evaluationPlotValue(whiteMate)).toBe(MATE_PLOT_VALUE);
    expect(evaluationPlotValue(blackMate)).toBe(-MATE_PLOT_VALUE);
    expect(whiteBarShare(whiteMate)).toBeGreaterThan(0.9);
    expect(whiteBarShare(blackMate)).toBeLessThan(0.1);
    expect(evaluationGraphLabel(whiteMate)).toBe("M2");
    expect(evaluationGraphLabel(blackMate)).toBe("-M2");
    expect(mateLabel(5)).toBe("M3");
  });

  it("is neutral for missing evaluations", () => {
    expect(evaluationPlotValue(null)).toBe(0);
    expect(evaluationGraphLabel(undefined)).toBe("—");
    expect(whiteBarShare(null)).toBe(0.5);
  });

  it("builds initial, intermediate and final points in White perspective", async () => {
    const game = gameFromPgn(STANDARD_PGN, "graph-game");
    const { engine } = createScriptedEngine((fen, index) =>
      makeEngineEvaluation(fen, { whiteCentipawns: index * 20 - 40 }),
    );
    expect(buildGamePositions(game)).toHaveLength(11);

    const analysis = await new FullGameAnalysisRunner(engine).analyze({
      game,
      settings: createAnalysisSettings("quick"),
    });
    const points = buildEvaluationGraph(analysis);

    expect(points).toHaveLength(analysis.positions.length);
    expect(points[0]?.ply).toBe(0);
    expect(points.at(-1)?.ply).toBe(game.moves.length);
    expect(points[1]?.classification).toBeDefined();
    expect(points[1]?.label).toBe("-0.2");
    expect(points[1]?.plotValue).toBeLessThan(0);
  });

  it("handles missing and incomplete analysis safely", () => {
    expect(buildEvaluationGraph(null)).toEqual([]);
    const game = gameFromPgn(STANDARD_PGN, "incomplete-game");
    const points = buildEvaluationGraph({
      positions: [
        {
          ply: 0,
          fen: game.initialFen,
          sideToMove: "w",
          legalMoveCount: 20,
          isCheck: false,
          isCheckmate: false,
          isStalemate: false,
          isDraw: false,
          isTerminal: false,
          evaluation: fakePositionEvaluation(0.5, { uncertain: true }),
        },
        {
          ply: 1,
          fen: game.moves[0]!.fen,
          sideToMove: "b",
          legalMoveCount: 20,
          isCheck: false,
          isCheckmate: false,
          isStalemate: false,
          isDraw: false,
          isTerminal: false,
          evaluation: fakePositionEvaluation(0.5),
        },
      ],
    } as unknown as import("@/lib/analysis/types").FullGameAnalysis);

    expect(points).toHaveLength(2);
    expect(points[0]?.uncertain).toBe(true);
    expect(points[1]?.hasEvaluation).toBe(true);
  });
});
