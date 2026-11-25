import { describe, expect, it, vi } from "vitest";
import { ChesscomImportError } from "@/lib/chesscom/errors";
import {
  createPubApiClient,
  validateArchiveUrl,
} from "@/lib/chesscom/pubapi-client";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function clientWith(fetchImpl: typeof fetch) {
  return createPubApiClient({
    fetchImpl,
    cache: new Map(),
    userAgent: "MoveLens-test/1.0",
  });
}

describe("validateArchiveUrl", () => {
  it("accepts an official monthly archive URL", () => {
    const url = validateArchiveUrl(
      "https://api.chess.com/pub/player/hikaru/games/2026/10",
    );
    expect(url.pathname).toBe("/pub/player/hikaru/games/2026/10");
  });

  it("rejects arbitrary hosts and paths", () => {
    expect(() =>
      validateArchiveUrl("https://evil.test/pub/player/hikaru/games/2026/10"),
    ).toThrowError(ChesscomImportError);
    expect(() =>
      validateArchiveUrl("https://api.chess.com/pub/player/hikaru/games"),
    ).toThrowError(ChesscomImportError);
    expect(() =>
      validateArchiveUrl("https://api.chess.com/pub/player/hikaru/games/2026/13"),
    ).toThrowError(ChesscomImportError);
  });

  it("rejects query strings and fragments", () => {
    expect(() =>
      validateArchiveUrl(
        "https://api.chess.com/pub/player/hikaru/games/2026/10?x=1",
      ),
    ).toThrowError(ChesscomImportError);
    expect(() =>
      validateArchiveUrl(
        "https://api.chess.com/pub/player/hikaru/games/2026/10#x",
      ),
    ).toThrowError(ChesscomImportError);
  });
});

describe("createPubApiClient", () => {
  it("builds only official archive-list URLs and sends a descriptive User-Agent", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ archives: ["https://api.chess.com/pub/player/hikaru/games/2026/10"] }),
    );
    const client = clientWith(fetchMock as unknown as typeof fetch);
    await expect(client.getArchives("Hikaru")).resolves.toEqual([
      "https://api.chess.com/pub/player/hikaru/games/2026/10",
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.chess.com/pub/player/hikaru/games/archives",
      expect.objectContaining({
        headers: expect.objectContaining({
          "User-Agent": "MoveLens-test/1.0",
          Accept: "application/json",
        }),
      }),
    );
  });

  it("reuses cached body on a 304 conditional response", async () => {
    const game = { url: "https://www.chess.com/game/live/1", pgn: "1. e4 *", rules: "chess" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          { games: [game] },
          { headers: { "Content-Type": "application/json", ETag: '"abc"' } },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 304 }));
    const client = clientWith(fetchMock as unknown as typeof fetch);
    const archive = "https://api.chess.com/pub/player/hikaru/games/2026/10";

    await expect(client.getMonthlyGames(archive)).resolves.toHaveLength(1);
    await expect(client.getMonthlyGames(archive)).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect((secondInit.headers as Record<string, string>)["If-None-Match"]).toBe(
      '"abc"',
    );
  });

  it("maps 404, 410, 429, and 500 responses", async () => {
    const cases: Array<[number, ChesscomImportError["code"]]> = [
      [404, "not-found"],
      [410, "gone"],
      [429, "rate-limited"],
      [500, "upstream-error"],
    ];
    for (const [status, code] of cases) {
      const client = clientWith(
        vi.fn(async () => new Response("", { status })) as unknown as typeof fetch,
      );
      await expect(
        client.getMonthlyGames("https://api.chess.com/pub/player/hikaru/games/2026/10"),
      ).rejects.toMatchObject({ code });
    }
  });

  it("includes Retry-After for 429 and uses it in the message", async () => {
    const client = clientWith(
      vi.fn(async () => new Response("", { status: 429, headers: { "Retry-After": "30" } })) as unknown as typeof fetch,
    );
    await expect(
      client.getArchives("hikaru"),
    ).rejects.toMatchObject({ code: "rate-limited", retryAfter: "30", status: 429 });
  });

  it("reports invalid JSON", async () => {
    const client = clientWith(
      vi.fn(async () => new Response("not json", { status: 200 })) as unknown as typeof fetch,
    );
    await expect(client.getArchives("hikaru")).rejects.toMatchObject({
      code: "invalid-json",
    });
  });

  it("reports invalid response shapes", async () => {
    const client = clientWith(
      vi.fn(async () => jsonResponse({ archives: "nope" })) as unknown as typeof fetch,
    );
    await expect(client.getArchives("hikaru")).rejects.toMatchObject({
      code: "invalid-response",
    });
  });

  it("maps network failures", async () => {
    const client = clientWith(
      vi.fn(async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch,
    );
    await expect(client.getArchives("hikaru")).rejects.toMatchObject({
      code: "network-error",
    });
  });

  it("aborts timed-out requests", async () => {
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new Error("aborted"));
          });
        }),
    );
    const client = createPubApiClient({
      fetchImpl: fetchMock as unknown as typeof fetch,
      cache: new Map(),
      timeoutMs: 5,
    });
    await expect(client.getArchives("hikaru")).rejects.toMatchObject({
      code: "timeout",
    });
  });
});
