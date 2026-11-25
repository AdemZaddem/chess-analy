import { describe, expect, it } from "vitest";
import {
  calculateGameAccuracy,
  calculatePlayerAccuracy,
} from "@/lib/analysis/accuracy";
import { fakeMoveAnalysis } from "./full-game-test-helpers";

describe("accuracy calculation", () => {
  it("calculates White and Black accuracy independently", () => {
    const moves = [
      fakeMoveAnalysis({ color: "w", before: 0.8, after: 0.7 }),
      fakeMoveAnalysis({ color: "b", before: 0.4, after: 0.7 }),
      fakeMoveAnalysis({ color: "w", before: 0.6, after: 0.58 }),
      fakeMoveAnalysis({ color: "b", before: 0.35, after: 0.4 }),
    ];
    const accuracy = calculateGameAccuracy(moves);

    expect(accuracy.white.movesCounted).toBe(2);
    expect(accuracy.white.totalExpectedPointsLoss).toBeCloseTo(0.12, 12);
    expect(accuracy.white.accuracy).toBeCloseTo(94, 12);
    expect(accuracy.black.totalExpectedPointsLoss).toBeCloseTo(0.35, 12);
    expect(accuracy.black.accuracy).toBeCloseTo(82.5, 12);
  });

  it("skips forced moves and reports zero-move players safely", () => {
    const moves = [
      fakeMoveAnalysis({ color: "w", before: 0.9, after: 0.1, forced: true }),
      fakeMoveAnalysis({ color: "w", before: 0.8, after: 0.6 }),
    ];
    const white = calculatePlayerAccuracy(moves, "w");
    const black = calculatePlayerAccuracy(moves, "b");

    expect(white.movesCounted).toBe(1);
    expect(white.forcedMovesSkipped).toBe(1);
    expect(white.totalExpectedPointsLoss).toBeCloseTo(0.2, 12);
    expect(white.accuracy).toBe(80);
    expect(black.accuracy).toBe(100);
    expect(black.movesCounted).toBe(0);
  });

  it("handles winning, losing, drawn and early-terminated games", () => {
    const winning = calculatePlayerAccuracy([
      fakeMoveAnalysis({ before: 0.9, after: 0.95 }),
    ], "w");
    const losing = calculatePlayerAccuracy([
      fakeMoveAnalysis({ before: 1, after: 0 }),
    ], "w");
    const drawn = calculatePlayerAccuracy([
      fakeMoveAnalysis({ before: 0.5, after: 0.5 }),
      fakeMoveAnalysis({ color: "b", before: 0.5, after: 0.5 }),
    ], "w");

    expect(winning.accuracy).toBe(100);
    expect(losing.accuracy).toBe(0);
    expect(drawn.accuracy).toBe(100);
    expect(Number.isFinite(losing.totalExpectedPointsLoss)).toBe(true);
  });

  it("always returns a finite percentage clamped to 0-100", () => {
    const moves = [
      fakeMoveAnalysis({ before: 5, after: -5 }),
      fakeMoveAnalysis({ before: 5, after: -5 }),
    ];
    const accuracy = calculatePlayerAccuracy(moves, "w");

    expect(accuracy.accuracy).toBe(0);
    expect(Number.isFinite(accuracy.accuracy)).toBe(true);
    expect(accuracy.totalExpectedPointsLoss).toBe(2);
  });
});
