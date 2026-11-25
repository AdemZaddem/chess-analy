import { describe, expect, it, vi } from "vitest";
import { ChesscomImportError } from "@/lib/chesscom/errors";
import {
  findChesscomGame,
  sortArchivesNewestFirst,
} from "@/lib/chesscom/game-search";
import type { PubApiClient } from "@/lib/chesscom/pubapi-client";
import type { PubApiGame } from "@/lib/chesscom/pubapi-types";
import { STANDARD_PGN } from "./fixtures";

const GAME_ID = "184727190848";
const GAME_URL = `https://www.chess.com/game/live/${GAME_ID}`;
const ARCHIVES = [
  "https://api.chess.com/pub/player/hikaru/games/2026/09",
  "https://api.chess.com/pub/player/hikaru/games/2026/11",
  "https://api.chess.com/pub/player/hikaru/games/2026/10",
];

function game(overrides: Partial<PubApiGame> = {}): PubApiGame {
  return {
    url: GAME_URL,
    pgn: `[Link "${GAME_URL}"]\n${STANDARD_PGN}`,
    rules: "chess",
    time_class: "blitz",
    white: { username: "Hikaru" },
    black: { username: "Other" },
    ...overrides,
  };
}

function fakeClient(options: {
  archives?: string[];
  months?: Record<string, PubApiGame[] | ChesscomImportError>;
  getArchives?: () => Promise<string[]>;
} = {}): PubApiClient {
  const months = options.months ?? {};
  return {
    getArchives:
      options.getArchives ??
      vi.fn(async () => options.archives ?? ARCHIVES),
    getMonthlyGames: vi.fn(async (url: string) => {
      const value = months[url];
      if (value instanceof ChesscomImportError) throw value;
      return value ?? [];
    }),
    clearCache: vi.fn(),
  };
}

describe("sortArchivesNewestFirst", () => {
  it("sorts descending, deduplicates, and rejects invalid URLs", () => {
    expect(
      sortArchivesNewestFirst([ARCHIVES[0]!, ARCHIVES[2]!, ARCHIVES[1]!, ARCHIVES[2]!]).map(
        (entry) => entry.url,
      ),
    ).toEqual([ARCHIVES[1], ARCHIVES[2], ARCHIVES[0]]);
    expect(() => sortArchivesNewestFirst(["not-a-url"])).toThrowError(
      ChesscomImportError,
    );
  });
});

describe("findChesscomGame", () => {
  it("finds a game in the newest archive and stops immediately", async () => {
    const client = fakeClient({
      months: { [ARCHIVES[1]!]: [game()] },
    });
    const result = await findChesscomGame(
      { gameUrl: GAME_URL, username: "Hikaru" },
      { client },
    );

    expect(result.status).toBe("success");
    expect(result.gameUrl).toBe(GAME_URL);
    expect(result.metadata).toMatchObject({
      gameId: GAME_ID,
      gameType: "live",
      rules: "chess",
      timeClass: "blitz",
      white: "Hikaru",
    });
    expect(result.source).toMatchObject({
      kind: "chesscom",
      username: "hikaru",
      gameId: GAME_ID,
    });
    expect(client.getMonthlyGames).toHaveBeenCalledTimes(1);
    expect(client.getMonthlyGames).toHaveBeenCalledWith(ARCHIVES[1]);
  });

  it("searches older archives sequentially and accepts a final-archive match", async () => {
    const calls: string[] = [];
    const client = fakeClient({
      archives: [
        "https://api.chess.com/pub/player/hikaru/games/2024/01",
        "https://api.chess.com/pub/player/hikaru/games/2025/02",
        "https://api.chess.com/pub/player/hikaru/games/2026/10",
      ],
      months: {
        "https://api.chess.com/pub/player/hikaru/games/2024/01": [game()],
      },
    });
    vi.mocked(client.getMonthlyGames).mockImplementation(async (url) => {
      calls.push(url);
      return url.endsWith("2024/01") ? [game()] : [];
    });

    await expect(
      findChesscomGame({ gameUrl: GAME_URL, username: "hikaru" }, { client }),
    ).resolves.toMatchObject({ status: "success" });
    expect(calls).toEqual([
      "https://api.chess.com/pub/player/hikaru/games/2026/10",
      "https://api.chess.com/pub/player/hikaru/games/2025/02",
      "https://api.chess.com/pub/player/hikaru/games/2024/01",
    ]);
  });

  it("skips missing monthly archives listed by the API and continues", async () => {
    const client = fakeClient({
      months: {
        [ARCHIVES[1]!]: new ChesscomImportError("not-found", "missing", { status: 404 }),
        [ARCHIVES[2]!]: new ChesscomImportError("gone", "gone", { status: 410 }),
        [ARCHIVES[0]!]: [game()],
      },
    });
    await expect(
      findChesscomGame({ gameUrl: GAME_URL, username: "hikaru" }, { client }),
    ).resolves.toMatchObject({ status: "success" });
    expect(client.getMonthlyGames).toHaveBeenCalledTimes(3);
  });

  it("requires exact game ID and game type matching", async () => {
    const client = fakeClient({
      months: {
        [ARCHIVES[1]!]: [
          game({ url: "https://www.chess.com/game/live/1847271908480" }),
          game({ url: "https://www.chess.com/game/live/18472719084" }),
          game({ url: "https://www.chess.com/game/daily/184727190848" }),
          game({ url: GAME_URL }),
        ],
      },
    });
    await expect(
      findChesscomGame({ gameUrl: GAME_URL, username: "hikaru" }, { client }),
    ).resolves.toMatchObject({ status: "success" });
  });

  it("reports when a duplicate-looking ID is the only available game", async () => {
    const client = fakeClient({
      months: {
        [ARCHIVES[1]!]: [
          game({ url: "https://www.chess.com/game/live/1847271908480" }),
        ],
      },
    });
    await expect(
      findChesscomGame({ gameUrl: GAME_URL, username: "hikaru" }, { client }),
    ).rejects.toMatchObject({ code: "game-not-found" });
  });

  it("reports an empty archive list and an absent game", async () => {
    await expect(
      findChesscomGame(
        { gameUrl: GAME_URL, username: "hikaru" },
        { client: fakeClient({ archives: [] }) },
      ),
    ).rejects.toMatchObject({ code: "game-not-found" });

    await expect(
      findChesscomGame(
        { gameUrl: GAME_URL, username: "hikaru" },
        { client: fakeClient() },
      ),
    ).rejects.toMatchObject({ code: "game-not-found" });
  });

  it("rejects unsupported variants", async () => {
    const client = fakeClient({
      months: { [ARCHIVES[1]!]: [game({ rules: "crazyhouse" })] },
    });
    await expect(
      findChesscomGame({ gameUrl: GAME_URL, username: "hikaru" }, { client }),
    ).rejects.toMatchObject({ code: "unsupported-variant" });
  });

  it("verifies an optional PGN Link tag matches the requested game", async () => {
    const noLink = fakeClient({
      months: { [ARCHIVES[1]!]: [game({ pgn: STANDARD_PGN })] },
    });
    await expect(
      findChesscomGame({ gameUrl: GAME_URL, username: "hikaru" }, { client: noLink }),
    ).resolves.toMatchObject({ status: "success" });

    const mismatch = fakeClient({
      months: {
        [ARCHIVES[1]!]: [
          game({
            pgn: `[Link "https://www.chess.com/game/live/999"]\n${STANDARD_PGN}`,
          }),
        ],
      },
    });
    await expect(
      findChesscomGame({ gameUrl: GAME_URL, username: "hikaru" }, { client: mismatch }),
    ).rejects.toMatchObject({ code: "game-mismatch" });
  });

  it("rejects missing PGNs and unparseable PGNs", async () => {
    const missing = fakeClient({
      months: { [ARCHIVES[1]!]: [game({ pgn: undefined })] },
    });
    await expect(
      findChesscomGame({ gameUrl: GAME_URL, username: "hikaru" }, { client: missing }),
    ).rejects.toMatchObject({ code: "game-unavailable" });

    const invalid = fakeClient({
      months: { [ARCHIVES[1]!]: [game({ pgn: "1. e4 Nz3" })] },
    });
    await expect(
      findChesscomGame({ gameUrl: GAME_URL, username: "hikaru" }, { client: invalid }),
    ).rejects.toMatchObject({ code: "invalid-pgn" });
  });

  it("propagates invalid archive responses and rate limits", async () => {
    const invalidArchives = fakeClient({
      getArchives: async () => {
        throw new ChesscomImportError("invalid-response", "bad archives");
      },
    });
    await expect(
      findChesscomGame(
        { gameUrl: GAME_URL, username: "hikaru" },
        { client: invalidArchives },
      ),
    ).rejects.toMatchObject({ code: "invalid-response" });

    const limited = fakeClient({
      months: {
        [ARCHIVES[1]!]: new ChesscomImportError("rate-limited", "slow down"),
      },
    });
    await expect(
      findChesscomGame({ gameUrl: GAME_URL, username: "hikaru" }, { client: limited }),
    ).rejects.toMatchObject({ code: "rate-limited" });
  });

  it("validates URL and username before making requests", async () => {
    const client = fakeClient();
    await expect(
      findChesscomGame(
        { gameUrl: "https://example.com/game/live/1", username: "hikaru" },
        { client },
      ),
    ).rejects.toMatchObject({ code: "invalid-url" });
    await expect(
      findChesscomGame({ gameUrl: GAME_URL, username: "bad name" }, { client }),
    ).rejects.toMatchObject({ code: "invalid-username" });
    expect(client.getArchives).not.toHaveBeenCalled();
  });
});
