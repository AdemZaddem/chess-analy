import { describe, expect, it } from "vitest";
import { buildBoardAnnotations } from "@/lib/review/annotations";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("board annotations", () => {
  it("draws the played move and a legal engine best-move arrow", () => {
    const result = buildBoardAnnotations({
      fen: START,
      playedMove: { from: "e2", to: "e4" },
      engineUci: "g1f3",
    });
    expect(result.arrows).toHaveLength(2);
    expect(result.arrows[0]).toMatchObject({ startSquare: "e2", endSquare: "e4" });
    expect(result.arrows[1]).toMatchObject({ startSquare: "g1", endSquare: "f3" });
    expect(result.squareStyles["e4"]).toBeDefined();
    expect(result.squareStyles["f3"]).toBeDefined();
  });

  it("rejects an engine move that is not legal in the displayed position", () => {
    const result = buildBoardAnnotations({
      fen: START,
      playedMove: { from: "e2", to: "e4" },
      engineUci: "e7e5",
    });
    expect(result.arrows).toHaveLength(1);
    expect(result.squareStyles["e7"]).toBeUndefined();
  });

  it("gives a variation move priority and never shows more than two arrows", () => {
    const result = buildBoardAnnotations({
      fen: START,
      playedMove: { from: "e2", to: "e4" },
      engineUci: "g1f3",
      variationMove: { from: "d2", to: "d4" },
    });
    expect(result.arrows).toHaveLength(1);
    expect(result.arrows[0]).toMatchObject({ startSquare: "d2", endSquare: "d4" });
  });

  it("ignores malformed squares", () => {
    const result = buildBoardAnnotations({
      fen: START,
      playedMove: { from: "", to: "e4" },
      engineUci: "xxxx",
    });
    expect(result.arrows).toEqual([]);
    expect(result.squareStyles).toEqual({});
  });
});
