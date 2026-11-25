import { describe, expect, it } from "vitest";
import { DEFAULT_POSITION } from "chess.js";
import { parsePgn, PgnParseError } from "@/lib/chess/pgn-parser";
import {
  CASTLING_PGN,
  CHECKMATE_PGN,
  COMMENTED_PGN,
  CUSTOM_FEN_PGN,
  EN_PASSANT_PGN,
  INVALID_PGN,
  PROMOTION_PGN,
  STANDARD_PGN,
} from "./fixtures";

describe("parsePgn", () => {
  it("parses a valid game and extracts metadata", () => {
    const game = parsePgn(STANDARD_PGN);

    expect(game.metadata.white).toMatchObject({ name: "Alice", rating: 1842 });
    expect(game.metadata.black).toMatchObject({ name: "Bob", rating: 1775 });
    expect(game.metadata.result).toBe("1-0");
    expect(game.metadata.timeControl).toBe("600+5");
    expect(game.metadata.opening).toBe("Ruy Lopez");
    expect(game.metadata.eco).toBe("C60");
    expect(game.metadata.event).toBe("Test Open");
    expect(game.metadata.date).toBe("2025.06.15");
    expect(game.metadata.round).toBe("3");
    expect(game.metadata.site).toBe("Internet");
    expect(game.moves).toHaveLength(10);
    expect(game.pgn).toContain('[White "Alice"]');
  });

  it("uses the standard starting position for a normal PGN", () => {
    const game = parsePgn(STANDARD_PGN);

    expect(game.initialFen).toBe(DEFAULT_POSITION);
    expect(game.moves[0]).toMatchObject({
      ply: 1,
      moveNumber: 1,
      color: "w",
      san: "e4",
      from: "e2",
      to: "e4",
    });
  });

  it("supports a non-standard FEN starting position", () => {
    const game = parsePgn(CUSTOM_FEN_PGN);

    expect(game.initialFen).toBe(
      "8/8/8/8/8/8/4P3/4K2k w - - 3 7",
    );
    expect(game.moves[0]?.moveNumber).toBe(7);
    expect(game.moves[0]?.san).toBe("e4");
  });

  it("preserves castling, en passant and promotion moves", () => {
    const castling = parsePgn(CASTLING_PGN);
    const castle = castling.moves.find((move) => move.san === "O-O");
    expect(castle).toMatchObject({ from: "e1", to: "g1" });
    expect(castle?.fen).toContain("RNBQ1RK1");

    const enPassant = parsePgn(EN_PASSANT_PGN);
    expect(enPassant.moves.at(-1)).toMatchObject({ from: "e5", to: "d6" });
    expect(enPassant.moves.at(-1)?.fen).toContain("p2P4");

    const promotion = parsePgn(PROMOTION_PGN);
    expect(promotion.moves.at(-1)).toMatchObject({
      san: "g8=Q",
      from: "g7",
      to: "g8",
      promotion: "q",
    });
    expect(promotion.moves.at(-1)?.fen).toContain("6Q1");
  });

  it("parses checkmate and stalemate games", () => {
    const mate = parsePgn(CHECKMATE_PGN);
    expect(mate.moves.at(-1)?.san).toBe("Qxf7#");
    expect(mate.moves.at(-1)?.fen).toContain("pppp1Qpp");
  });

  it("keeps comments attached to the move they follow", () => {
    const game = parsePgn(COMMENTED_PGN);
    expect(game.moves[2]?.comment).toBe("The king's knight develops");
  });

  it("extracts titles and inline ratings from player tags", () => {
    const game = parsePgn(
      '[White "GM Alice (2841)"]\n[Black "Bob"]\n\n1. e4 e5 1-0',
    );
    expect(game.metadata.white).toEqual({
      name: "Alice",
      rating: 2841,
      title: "GM",
    });
  });

  it("reports invalid PGN with an understandable error", () => {
    let error: unknown;
    try {
      parsePgn(INVALID_PGN);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(PgnParseError);
    expect((error as PgnParseError).kind).toBe("invalid");
    expect((error as PgnParseError).message).toContain("Could not parse this PGN");
  });

  it("rejects empty input", () => {
    for (const input of ["", "   \n\n", "\uFEFF  "]) {
      expect(() => parsePgn(input)).toThrowError(/empty/i);
    }
  });

  it("rejects unsupported chess variants", () => {
    const pgn = '[Variant "Chess960"]\n\n1. e4 e5';
    expect(() => parsePgn(pgn)).toThrowError(/standard chess/i);
  });
});
