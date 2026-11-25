import { describe, expect, it } from "vitest";
import {
  CLASSIFICATION_PRIORITY,
  classifyMove,
} from "@/lib/analysis/classification";
import { createAnalysisSettings } from "@/lib/analysis/settings";
import type {
  GamePosition,
  MoveClassification,
  PositionEvaluation,
  PositionMove,
} from "@/lib/analysis/types";
import { fakeGamePosition, fakePositionEvaluation } from "./full-game-test-helpers";

const settings = createAnalysisSettings();

function runClassification(options: {
  beforeWhite: number;
  afterWhite: number;
  move?: Partial<PositionMove>;
  beforeEvaluation?: Partial<PositionEvaluation>;
  afterEvaluation?: Partial<PositionEvaluation>;
}) {
  const move: PositionMove = {
    ply: 1,
    moveNumber: 1,
    color: "w",
    san: "e4",
    uci: "e2e4",
    from: "e2",
    to: "e4",
    piece: "p",
    isCapture: false,
    isRecapture: false,
    isPromotion: false,
    givesCheck: false,
    materialDelta: 0,
    legalMoveCount: 20,
    isForced: false,
    ...options.move,
  };
  const positionBefore: GamePosition = fakeGamePosition();
  const positionAfter: GamePosition = fakeGamePosition(move);
  const evaluationBefore = fakePositionEvaluation(options.beforeWhite, {
    bestMove: move.uci,
    ...options.beforeEvaluation,
  });
  const evaluationAfter = fakePositionEvaluation(options.afterWhite, options.afterEvaluation);

  return classifyMove({
    settings,
    positionBefore,
    positionAfter,
    evaluationBefore,
    evaluationAfter,
  });
}

describe("move classification", () => {
  it("labels engine-best, excellent, good, inaccuracy, mistake and blunder moves", () => {
    expect(runClassification({ beforeWhite: 0.5, afterWhite: 0.52 }).classification).toBe("best");
    expect(
      runClassification({
        beforeWhite: 0.5,
        afterWhite: 0.5,
        beforeEvaluation: { bestMove: "d2d4" },
      }).classification,
    ).toBe("excellent");
    expect(
      runClassification({
        beforeWhite: 0.5,
        afterWhite: 0.44,
        beforeEvaluation: { bestMove: "d2d4" },
      }).classification,
    ).toBe("good");
    expect(
      runClassification({ beforeWhite: 0.5, afterWhite: 0.4 }).classification,
    ).toBe("inaccuracy");
    expect(
      runClassification({ beforeWhite: 0.5, afterWhite: 0.3 }).classification,
    ).toBe("mistake");
    expect(
      runClassification({ beforeWhite: 0.5, afterWhite: 0.1 }).classification,
    ).toBe("blunder");
  });

  it("awards brilliant only to justified non-forced material sacrifices", () => {
    const result = runClassification({
      beforeWhite: 0.5,
      afterWhite: 0.75,
      move: { materialDelta: -3, san: "Rxd5", isCapture: true },
    });
    expect(result.classification).toBe("brilliant");
    expect(result.reasons.join(" ")).toContain("sacrifice");

    const recapture = runClassification({
      beforeWhite: 0.5,
      afterWhite: 0.75,
      move: { materialDelta: -3, isRecapture: true },
    });
    expect(recapture.classification).not.toBe("brilliant");

    const forced = runClassification({
      beforeWhite: 0.5,
      afterWhite: 0.75,
      move: { materialDelta: -3, isForced: true },
    });
    expect(forced.classification).toBe("best");

    const unresolved = runClassification({
      beforeWhite: 0.8,
      afterWhite: 0.55,
      move: { materialDelta: -3 },
    });
    expect(unresolved.classification).not.toBe("brilliant");
  });

  it("awards great for an engine-best tactical conversion", () => {
    const result = runClassification({
      beforeWhite: 0.5,
      afterWhite: 0.82,
      move: { givesCheck: true },
    });
    expect(result.classification).toBe("great");

    const quiet = runClassification({
      beforeWhite: 0.5,
      afterWhite: 0.82,
      move: { legalMoveCount: 8 },
    });
    expect(quiet.classification).not.toBe("great");
  });

  it("detects missed wins separately from ordinary mistakes", () => {
    const missed = runClassification({
      beforeWhite: 0.95,
      afterWhite: 0.5,
    });
    expect(missed.classification).toBe("missedWin");
    expect(missed.expectedPointsLoss).toBeCloseTo(0.45, 12);

    const ordinary = runClassification({
      beforeWhite: 0.8,
      afterWhite: 0.5,
    });
    expect(ordinary.classification).toBe("mistake");
  });

  it("handles forced moves, mate evaluations and uncertain data", () => {
    const forced = runClassification({
      beforeWhite: 0.95,
      afterWhite: 0.2,
      move: { isForced: true, legalMoveCount: 1 },
    });
    expect(forced.classification).toBe("best");
    expect(forced.reasons.join(" ")).toContain("Only one legal move");

    const missedMate = runClassification({
      beforeWhite: 1,
      afterWhite: 0.55,
      beforeEvaluation: {
        score: { kind: "mate", mate: 2, label: "White mates in 2" },
      },
    });
    expect(missedMate.classification).toBe("missedWin");

    const uncertain = runClassification({
      beforeWhite: 0.5,
      afterWhite: 0.75,
      move: { materialDelta: -3 },
      beforeEvaluation: { uncertain: true },
    });
    expect(uncertain.classification).not.toBe("brilliant");
    expect(uncertain.reasons.join(" ")).toContain("withheld");
  });

  it("documents an explicit priority and defers book moves", () => {
    expect(CLASSIFICATION_PRIORITY.map((entry) => entry.label)).not.toContain("book");
    expect(CLASSIFICATION_PRIORITY[0]).toEqual({
      rule: "forced move",
      label: "best",
    });
    const classifications = new Set<MoveClassification>();
    classifications.add(
      runClassification({ beforeWhite: 0.5, afterWhite: 0.1 }).classification,
    );
    classifications.add(
      runClassification({ beforeWhite: 0.5, afterWhite: 0.75, move: { materialDelta: -3 } })
        .classification,
    );
    expect(classifications.has("book")).toBe(false);
  });
});
