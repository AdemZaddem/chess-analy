import { describe, expect, it } from "vitest";
import { Chess, DEFAULT_POSITION } from "chess.js";
import {
  buildTimeline,
  clampPly,
  firstPly,
  getPositionStatus,
  lastPly,
  nextPly,
  previousPly,
} from "@/lib/chess/game-navigation";
import { parsePgn } from "@/lib/chess/pgn-parser";
import type { NormalizedGame } from "@/lib/chess/types";
import {
  CASTLING_PGN,
  CHECKMATE_PGN,
  CUSTOM_FEN_PGN,
  EN_PASSANT_PGN,
  PROMOTION_PGN,
  STALEMATE_PGN,
  STANDARD_PGN,
} from "./fixtures";

function asGame(pgn: string): NormalizedGame {
  return {
    ...parsePgn(pgn),
    source: { kind: "text" },
    gameCount: 1,
    gameIndex: 1,
    warnings: [],
  };
}

describe("game navigation", () => {
  it("builds a timeline starting at the initial position", () => {
    const game = asGame(STANDARD_PGN);
    const timeline = buildTimeline(game);

    expect(timeline).toHaveLength(game.moves.length + 1);
    expect(timeline[0]?.ply).toBe(0);
    expect(timeline[0]?.fen).toBe(DEFAULT_POSITION);
    expect(timeline[0]?.move).toBeUndefined();
    for (const move of game.moves) {
      expect(timeline[move.ply]?.fen).toBe(move.fen);
      expect(timeline[move.ply]?.move?.san).toBe(move.san);
    }
    expect(timeline.at(-1)?.ply).toBe(game.moves.length);
  });

  it("moves forward, backward, to arbitrary moves and to the ends", () => {
    const game = asGame(STANDARD_PGN);
    const total = game.moves.length;

    let ply = firstPly();
    ply = nextPly(ply, total);
    expect(ply).toBe(1);
    ply = nextPly(ply, total);
    expect(ply).toBe(2);
    expect(previousPly(ply)).toBe(1);
    expect(clampPly(7, total)).toBe(7);
    expect(clampPly(99, total)).toBe(total);
    expect(clampPly(-4, total)).toBe(0);
    expect(lastPly(total)).toBe(total);
    expect(firstPly()).toBe(0);
  });

  it("shows the correct position after castling", () => {
    const timeline = buildTimeline(asGame(CASTLING_PGN));
    const board = new Chess(timeline.at(-1)?.fen ?? "");

    expect(board.get("g1")).toEqual({ color: "w", type: "k" });
    expect(board.get("f1")).toEqual({ color: "w", type: "r" });
  });

  it("removes the en passant captured pawn", () => {
    const timeline = buildTimeline(asGame(EN_PASSANT_PGN));
    const board = new Chess(timeline.at(-1)?.fen ?? "");

    expect(board.get("d6")).toEqual({ color: "w", type: "p" });
    expect(board.get("d5")).toBeUndefined();
  });

  it("promotes the pawn to the requested piece", () => {
    const timeline = buildTimeline(asGame(PROMOTION_PGN));
    const board = new Chess(timeline.at(-1)?.fen ?? "");

    expect(board.get("g8")).toEqual({ color: "w", type: "q" });
  });

  it("detects checkmate and stalemate positions", () => {
    const mate = buildTimeline(asGame(CHECKMATE_PGN));
    expect(getPositionStatus(mate.at(-1)?.fen ?? "")).toBe("checkmate");

    const stalemate = buildTimeline(asGame(STALEMATE_PGN));
    expect(getPositionStatus(stalemate.at(-1)?.fen ?? "")).toBe("stalemate");
  });

  it("uses a non-standard FEN as the starting timeline position", () => {
    const timeline = buildTimeline(asGame(CUSTOM_FEN_PGN));

    expect(timeline[0]?.fen).toBe("8/8/8/8/8/8/4P3/4K2k w - - 3 7");
    expect(new Chess(timeline[1]?.fen ?? "").get("e4")).toEqual({
      color: "w",
      type: "p",
    });
  });
});
