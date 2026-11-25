import { describe, expect, it } from "vitest";
import { splitPgnGames } from "@/lib/chess/pgn-split";
import { MULTI_GAME_PGN, STANDARD_PGN } from "./fixtures";

describe("splitPgnGames", () => {
  it("keeps a single game intact", () => {
    expect(splitPgnGames(STANDARD_PGN)).toHaveLength(1);
  });

  it("splits games separated by blank lines", () => {
    const games = splitPgnGames(MULTI_GAME_PGN);
    expect(games).toHaveLength(2);
    expect(games[0]).toContain('[White "Alice"]');
    expect(games[1]).toContain('[White "Carol"]');
  });

  it("splits games even without a blank line between them", () => {
    const document = `1. e4 e5 1-0\n[Event "Second"]\n\n1. d4 d5 0-1`;
    expect(splitPgnGames(document)).toHaveLength(2);
  });

  it("does not split on header-like text inside a comment", () => {
    const document = `1. e4 {[Event "Not a game"]} e5 1-0`;
    expect(splitPgnGames(document)).toHaveLength(1);
  });
});
