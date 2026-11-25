import { describe, expect, it } from "vitest";
import { buildGamePositions } from "@/lib/analysis/positions";
import { gameFromPgn } from "./full-game-test-helpers";
import {
  BLACK_TO_MOVE_FEN_PGN,
  CASTLING_PGN,
  CHECKMATE_PGN,
  CUSTOM_FEN_PGN,
  EN_PASSANT_PGN,
  LONG_PGN,
  PROMOTION_PGN,
  STANDARD_PGN,
} from "./fixtures";

describe("full-game position generation", () => {
  it("replays a standard game from the initial FEN into N+1 positions", () => {
    const game = gameFromPgn(STANDARD_PGN);
    const positions = buildGamePositions(game);

    expect(positions).toHaveLength(game.moves.length + 1);
    expect(positions[0]).toMatchObject({
      ply: 0,
      fen: game.initialFen,
      sideToMove: "w",
    });
    expect(positions[0]?.move).toBeUndefined();
    expect(positions.slice(1).map((position) => position.ply)).toEqual(
      game.moves.map((move) => move.ply),
    );
    expect(positions.at(-1)?.fen).toBe(game.moves.at(-1)?.fen);
    expect(game.initialFen).toBe(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    );
  });

  it("respects a black-to-move custom starting position", () => {
    const game = gameFromPgn(BLACK_TO_MOVE_FEN_PGN);
    const positions = buildGamePositions(game);

    expect(positions[0]?.sideToMove).toBe("b");
    expect(positions[0]?.fen).toBe(game.initialFen);
    expect(positions[1]?.sideToMove).toBe("w");
    expect(positions[1]?.move?.color).toBe("b");
  });

  it("uses a non-standard FEN and its fullmove number", () => {
    const game = gameFromPgn(CUSTOM_FEN_PGN);
    const positions = buildGamePositions(game);

    expect(positions).toHaveLength(5);
    expect(positions[0]?.fen).toBe(game.initialFen);
    expect(positions[1]?.move?.moveNumber).toBe(7);
    expect(positions.at(-1)?.fen).toBe(game.moves.at(-1)?.fen);
  });

  it("handles short games, promotion, castling and en passant", () => {
    const promotion = buildGamePositions(gameFromPgn(PROMOTION_PGN));
    expect(promotion).toHaveLength(2);
    expect(promotion[1]?.move).toMatchObject({
      san: "g8=Q",
      isPromotion: true,
      promotion: "q",
      materialDelta: 8,
    });

    const castling = buildGamePositions(gameFromPgn(CASTLING_PGN));
    const castle = castling.find((position) => position.move?.san === "O-O");
    expect(castle?.move).toMatchObject({ uci: "e1g1", piece: "k" });

    const enPassant = buildGamePositions(gameFromPgn(EN_PASSANT_PGN));
    const capture = enPassant.find((position) => position.move?.san === "exd6");
    expect(capture?.move).toMatchObject({
      isCapture: true,
      captured: "p",
      uci: "e5d6",
    });
  });

  it("handles long games and terminal checkmate positions", () => {
    const longGame = gameFromPgn(LONG_PGN);
    expect(buildGamePositions(longGame)).toHaveLength(21);

    const mate = buildGamePositions(gameFromPgn(CHECKMATE_PGN));
    expect(mate.at(-1)).toMatchObject({
      isCheckmate: true,
      isTerminal: true,
      legalMoveCount: 0,
    });
  });

  it("keeps resignation games without inventing a terminal position", () => {
    const game = gameFromPgn(STANDARD_PGN);
    const positions = buildGamePositions(game);

    expect(game.metadata.result).toBe("1-0");
    expect(positions.every((position) => !position.isCheckmate)).toBe(true);
  });
});
