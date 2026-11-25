import { describe, expect, it } from "vitest";
import { ChesscomImportError } from "@/lib/chesscom/errors";
import { parseChesscomGameUrl } from "@/lib/chesscom/game-url";

describe("parseChesscomGameUrl", () => {
  it("parses a live game URL", () => {
    expect(parseChesscomGameUrl("https://www.chess.com/game/live/184727190848")).toEqual({
      gameId: "184727190848",
      gameType: "live",
      canonicalUrl: "https://www.chess.com/game/live/184727190848",
    });
  });

  it("parses a daily game URL without www", () => {
    expect(parseChesscomGameUrl("https://chess.com/game/daily/12345")).toEqual({
      gameId: "12345",
      gameType: "daily",
      canonicalUrl: "https://www.chess.com/game/daily/12345",
    });
  });

  it("handles a trailing slash and query parameters safely", () => {
    expect(
      parseChesscomGameUrl(
        "https://www.chess.com/game/live/999/?utm_source=share&locale=en",
      ),
    ).toEqual({
      gameId: "999",
      gameType: "live",
      canonicalUrl: "https://www.chess.com/game/live/999",
    });
  });

  it("trims surrounding whitespace", () => {
    expect(parseChesscomGameUrl("  https://www.chess.com/game/daily/42  ").gameId).toBe("42");
  });

  it("rejects an empty value", () => {
    expect(() => parseChesscomGameUrl("  ")).toThrowError(ChesscomImportError);
  });

  it("rejects unsupported hosts", () => {
    expect(() =>
      parseChesscomGameUrl("https://lichess.org/game/live/123"),
    ).toThrow(/chess\.com/i);
    expect(() =>
      parseChesscomGameUrl("https://www.chess.com.evil.test/game/live/123"),
    ).toThrow(/chess\.com/i);
  });

  it("rejects non-https URLs", () => {
    expect(() =>
      parseChesscomGameUrl("http://www.chess.com/game/live/123"),
    ).toThrow(/https/i);
  });

  it("rejects credentials and custom ports", () => {
    expect(() =>
      parseChesscomGameUrl("https://user@www.chess.com/game/live/123"),
    ).toThrow(/credentials|port/i);
    expect(() =>
      parseChesscomGameUrl("https://www.chess.com:8443/game/live/123"),
    ).toThrow(/credentials|port/i);
  });

  it("rejects unsupported paths and game types", () => {
    expect(() =>
      parseChesscomGameUrl("https://www.chess.com/game/tournament/123"),
    ).toThrow(/not supported|live and daily/i);
    expect(() => parseChesscomGameUrl("https://www.chess.com/player/hikaru")).toThrow(
      /game link/i,
    );
    expect(() =>
      parseChesscomGameUrl("https://www.chess.com/game/live/123/extra"),
    ).toThrow(/game ID|game link/i);
  });

  it("rejects malformed game IDs", () => {
    for (const id of ["abc", "12x", "0", "-5", "123.4", ""]) {
      expect(() =>
        parseChesscomGameUrl(`https://www.chess.com/game/live/${id}`),
      ).toThrow(/game ID/i);
    }
  });

  it("rejects non-string input", () => {
    expect(() =>
      parseChesscomGameUrl(null as unknown as string),
    ).toThrowError(ChesscomImportError);
  });
});
