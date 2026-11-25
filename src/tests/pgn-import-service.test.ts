import { describe, expect, it } from "vitest";
import { importPgn } from "@/lib/import/pgn-import-service";
import {
  INVALID_PGN,
  MULTI_GAME_PGN,
  STANDARD_PGN,
} from "./fixtures";

describe("importPgn", () => {
  it("imports a valid single game with source metadata", () => {
    const result = importPgn(STANDARD_PGN, {
      source: { kind: "file", filename: "game.pgn" },
    });

    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.game.gameCount).toBe(1);
    expect(result.game.gameIndex).toBe(1);
    expect(result.game.source).toEqual({
      kind: "file",
      filename: "game.pgn",
    });
    expect(result.game.moves).toHaveLength(10);
  });

  it("reports empty PGN as an error", () => {
    const result = importPgn("  \n");
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.kind).toBe("empty");
    expect(result.message).toMatch(/empty/i);
  });

  it("reports malformed PGN as an error", () => {
    const result = importPgn(INVALID_PGN);
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.kind).toBe("invalid");
    expect(result.message).toContain("Could not parse this PGN");
  });

  it("requires an explicit selection for multi-game PGN files", () => {
    const result = importPgn(MULTI_GAME_PGN);

    expect(result.status).toBe("multiple-games");
    if (result.status !== "multiple-games") return;
    expect(result.games).toHaveLength(2);
    expect(result.games[0]).toMatchObject({
      index: 1,
      white: "Alice",
      black: "Bob",
      result: "1-0",
      plyCount: 2,
    });
    expect(result.games[1]).toMatchObject({
      index: 2,
      white: "Carol",
      black: "Dave",
      result: "0-1",
    });
  });

  it("imports the explicitly selected game from a multi-game file", () => {
    const result = importPgn(MULTI_GAME_PGN, {
      source: { kind: "text" },
      gameIndex: 2,
    });

    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.game.metadata.white.name).toBe("Carol");
    expect(result.game.moves.map((move) => move.san)).toEqual(["d4", "d5"]);
    expect(result.game.gameCount).toBe(2);
    expect(result.game.gameIndex).toBe(2);
    expect(result.game.warnings).toHaveLength(1);
  });

  it("identifies which game in a multi-game file is malformed", () => {
    const brokenSecondGame = MULTI_GAME_PGN.replace("1. d4 d5", "1. d4 Nz9");
    const result = importPgn(brokenSecondGame);

    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.gameIndex).toBe(2);
    expect(result.message).toContain("Game 2");
  });

  it("rejects an out-of-range game selection", () => {
    const result = importPgn(STANDARD_PGN, { gameIndex: 3 });
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.kind).toBe("selection");
  });
});
