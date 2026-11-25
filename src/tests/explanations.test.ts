import { describe, expect, it } from "vitest";
import {
  describeEvaluationSwing,
  describeMoveClassification,
  isSignificantClassification,
  moveClassificationContext,
} from "@/lib/review/explanations";
import { fakeMoveAnalysis } from "./full-game-test-helpers";

describe("plain-language review explanations", () => {
  it("only marks notable classifications as significant", () => {
    expect(isSignificantClassification("blunder")).toBe(true);
    expect(isSignificantClassification("missedWin")).toBe(true);
    expect(isSignificantClassification("brilliant")).toBe(true);
    expect(isSignificantClassification("good")).toBe(false);
    expect(isSignificantClassification("excellent")).toBe(false);
  });

  it("explains a mistake using chances and the recommended move, not coordinates", () => {
    const move = {
      ...fakeMoveAnalysis({ color: "b", classification: "mistake", before: 0.8, after: 0.4 }),
      san: "g6",
      bestMoveSan: "Nf6",
      isBestMove: false,
    };
    expect(moveClassificationContext(move)).toBe("Mistake — Black played g6");
    expect(describeMoveClassification(move)).toContain("reduced Black's chances");
    expect(describeMoveClassification(move)).toContain("engine preferred Nf6");
    expect(describeMoveClassification(move)).not.toContain("g7g6");
  });

  it("explains a missed win and an evaluation swing without engine jargon", () => {
    const missed = {
      ...fakeMoveAnalysis({ color: "w", classification: "missedWin", before: 0.95, after: 0.5 }),
      san: "h3",
      bestMoveSan: "d4",
      isBestMove: false,
    };
    expect(describeMoveClassification(missed)).toContain("winning position");
    expect(describeEvaluationSwing(0.8, 0.2)).toBe(
      "The balance shifted from White was clearly better to Black was clearly better.",
    );
  });
});
