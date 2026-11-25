import { describe, expect, it } from "vitest";
import {
  centipawnExpectedPoints,
  clampExpectedPoints,
  expectedPointsForPlayer,
  expectedPointsFromWdl,
  expectedPointsLoss,
  whiteExpectedPoints,
} from "@/lib/analysis/expected-points";
import { createAnalysisSettings } from "@/lib/analysis/settings";
import { makeEngineEvaluation } from "./full-game-test-helpers";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const BLACK_FEN = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
const config = createAnalysisSettings().expectedPoints;

describe("expected points", () => {
  it("uses a symmetric, configurable centipawn fallback", () => {
    const positive = centipawnExpectedPoints(29, config);
    const negative = centipawnExpectedPoints(-29, config);

    expect(positive).toBeCloseTo(0.527, 3);
    expect(negative).toBeCloseTo(1 - positive, 12);
    expect(centipawnExpectedPoints(1000, config)).toBeGreaterThan(0.97);
    expect(centipawnExpectedPoints(-1000, config)).toBeLessThan(0.03);
    expect(centipawnExpectedPoints(100, { ...config, centipawnSlope: 0.01 })).toBeGreaterThan(
      centipawnExpectedPoints(100, config),
    );
    expect(centipawnExpectedPoints(Number.NaN, config)).toBe(0.5);
  });

  it("normalizes White and Black perspective centipawn evaluations", () => {
    const white = makeEngineEvaluation(START_FEN, { whiteCentipawns: 50 });
    const black = makeEngineEvaluation(BLACK_FEN, { whiteCentipawns: -50 });

    expect(whiteExpectedPoints(white, config)).toBeCloseTo(
      centipawnExpectedPoints(50, config),
      12,
    );
    expect(whiteExpectedPoints(black, config)).toBeCloseTo(
      centipawnExpectedPoints(-50, config),
      12,
    );
    expect(expectedPointsForPlayer(whiteExpectedPoints(white, config), "b")).toBeCloseTo(
      1 - centipawnExpectedPoints(50, config),
      12,
    );
  });

  it("converts side-to-move WDL to White and player perspectives", () => {
    const whiteToMove = makeEngineEvaluation(START_FEN, {
      wdl: { win: 56, draw: 938, loss: 6 },
    });
    const blackToMove = makeEngineEvaluation(BLACK_FEN, {
      wdl: { win: 14, draw: 962, loss: 24 },
    });

    expect(expectedPointsFromWdl({ win: 56, draw: 938, loss: 6 })).toBeCloseTo(0.525, 12);
    expect(whiteExpectedPoints(whiteToMove, config)).toBeCloseTo(0.525, 12);
    expect(whiteExpectedPoints(blackToMove, config)).toBeCloseTo(0.505, 12);
    expect(expectedPointsForPlayer(whiteExpectedPoints(blackToMove, config), "b")).toBeCloseTo(
      0.495,
      12,
    );
  });

  it("ignores WDL when disabled and handles invalid WDL data", () => {
    const withWdl = makeEngineEvaluation(START_FEN, {
      whiteCentipawns: 100,
      wdl: { win: 0, draw: 1000, loss: 0 },
    });

    expect(whiteExpectedPoints(withWdl, config)).toBe(0.5);
    expect(
      whiteExpectedPoints(withWdl, { ...config, useEngineWdl: false }),
    ).toBeCloseTo(centipawnExpectedPoints(100, config), 12);
    expect(expectedPointsFromWdl({ win: 0, draw: 0, loss: 0 })).toBe(0.5);
  });

  it("keeps mate scores decisive and separate from centipawns", () => {
    const whiteMates = makeEngineEvaluation(START_FEN, { mate: 3 });
    const blackMates = makeEngineEvaluation(START_FEN, { mate: -2 });
    const whiteIsMated = makeEngineEvaluation(
      "7K/6q1/6k1/8/8/8/8/8 w - - 0 1",
      { mate: 0 },
    );

    expect(whiteMates.evaluation.kind).toBe("mate");
    expect(whiteExpectedPoints(whiteMates, config)).toBe(1);
    expect(whiteExpectedPoints(blackMates, config)).toBe(0);
    expect(whiteExpectedPoints(whiteIsMated, config)).toBe(0);
  });

  it("clamps losses and invalid values without producing NaN", () => {
    expect(expectedPointsLoss(0.8, 0.5)).toBeCloseTo(0.3, 12);
    expect(expectedPointsLoss(0.4, 0.7)).toBe(0);
    expect(expectedPointsLoss(Number.NaN, 0.5)).toBe(0);
    expect(clampExpectedPoints(Number.POSITIVE_INFINITY)).toBe(0.5);
    expect(clampExpectedPoints(-4)).toBe(0);
    expect(clampExpectedPoints(9)).toBe(1);
  });
});
