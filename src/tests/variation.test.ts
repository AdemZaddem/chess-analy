import { describe, expect, it } from "vitest";
import { buildVariation, formatVariationSan } from "@/lib/review/variation";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("variation validation", () => {
  it("converts a legal UCI PV to SAN with FEN navigation steps", () => {
    const line = buildVariation(START, ["e2e4", "e7e5", "g1f3"]);
    expect(line.complete).toBe(true);
    expect(line.rejectedAt).toBeNull();
    expect(line.moves.map((move) => move.san)).toEqual(["e4", "e5", "Nf3"]);
    expect(line.moves[0]?.fenBefore).toBe(START);
    expect(line.moves[2]?.fenAfter.split(" ")[1]).toBe("b");
    expect(formatVariationSan(line.moves, START)).toBe("1. e4 e5 2. Nf3");
  });

  it("stops at the first illegal token instead of inventing a move", () => {
    const line = buildVariation(START, ["e2e4", "e7e9", "g1f3"]);
    expect(line.moves.map((move) => move.san)).toEqual(["e4"]);
    expect(line.rejectedAt).toBe(2);
    expect(line.complete).toBe(false);
  });

  it("handles castling, promotion and en passant", () => {
    const castling = buildVariation(START, [
      "e2e4",
      "e7e5",
      "g1f3",
      "b8c6",
      "f1b5",
      "a7a6",
      "e1g1",
    ]);
    expect(castling.moves.at(-1)?.san).toBe("O-O");

    const promotion = buildVariation(
      "8/6P1/8/8/8/8/8/K6k w - - 0 1",
      ["g7g8q"],
    );
    expect(promotion.moves[0]?.san).toBe("g8=Q");
    expect(promotion.moves[0]?.promotion).toBe("q");

    const enPassant = buildVariation(
      "rnbqkbnr/ppp1p1pp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3",
      ["e5d6"],
    );
    expect(enPassant.moves[0]?.san).toBe("exd6");
  });

  it("handles black-to-move numbering and invalid base FEN", () => {
    const blackStart =
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
    const line = buildVariation(blackStart, ["e7e5", "g1f3"]);
    expect(formatVariationSan(line.moves, blackStart)).toBe("1... e5 2. Nf3");

    const invalid = buildVariation("not a fen", ["e2e4"]);
    expect(invalid.moves).toEqual([]);
    expect(invalid.rejectedAt).toBe(1);
  });
});
