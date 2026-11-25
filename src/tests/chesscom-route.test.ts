import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/import/chesscom/route";
import type { ChesscomImportResponse } from "@/lib/chesscom/types";
import { STANDARD_PGN } from "./fixtures";

const GAME_ID = "184727190848";
const GAME_URL = `https://www.chess.com/game/live/${GAME_ID}`;

function json(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function request(body: unknown): Request {
  return new Request("http://localhost/api/import/chesscom", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function bodyOf(response: Response): Promise<ChesscomImportResponse> {
  return (await response.json()) as ChesscomImportResponse;
}

function mockApi(options: {
  username?: string;
  archivesStatus?: number;
  monthStatus?: number;
  game?: Record<string, unknown> | null;
  archiveMonth?: string;
} = {}) {
  const username = options.username ?? "routeuser";
  const month = options.archiveMonth ?? "2026/10";
  const archiveUrl = `https://api.chess.com/pub/player/${username}/games/${month}`;
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/games/archives")) {
      if (options.archivesStatus && options.archivesStatus !== 200) {
        return new Response("", { status: options.archivesStatus });
      }
      return json({ archives: [archiveUrl] });
    }
    if (url === archiveUrl) {
      if (options.monthStatus && options.monthStatus !== 200) {
        return new Response("", { status: options.monthStatus });
      }
      return json({ games: options.game ? [options.game] : [] });
    }
    return new Response("", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/import/chesscom", () => {
  it("returns a typed success with PGN and source metadata", async () => {
    mockApi({
      username: "routesuccess",
      game: {
        url: GAME_URL,
        pgn: `[Link "${GAME_URL}"]\n${STANDARD_PGN}`,
        rules: "chess",
        time_class: "rapid",
        white: { username: "Alice" },
        black: { username: "Bob" },
      },
    });

    const response = await POST(
      request({ gameUrl: GAME_URL, username: "routesuccess" }),
    );
    expect(response.status).toBe(200);
    const body = await bodyOf(response);
    expect(body.status).toBe("success");
    if (body.status !== "success") return;
    expect(body.pgn).toContain("1. e4 e5");
    expect(body.gameUrl).toBe(GAME_URL);
    expect(body.source.kind).toBe("chesscom");
    expect(body.metadata.gameId).toBe(GAME_ID);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("rejects invalid JSON and missing fields with 400", async () => {
    const invalidJson = await POST(
      new Request("http://localhost/api/import/chesscom", {
        method: "POST",
        body: "not json",
      }),
    );
    expect(invalidJson.status).toBe(400);
    expect(await bodyOf(invalidJson)).toMatchObject({
      status: "error",
      code: "invalid-request",
    });

    const missing = await POST(request({ gameUrl: GAME_URL }));
    expect(missing.status).toBe(400);
  });

  it("maps invalid URL and username to 400", async () => {
    const invalidUrl = await POST(
      request({ gameUrl: "https://example.com/game/live/1", username: "u" }),
    );
    expect(invalidUrl.status).toBe(400);
    expect(await bodyOf(invalidUrl)).toMatchObject({ code: "invalid-url" });

    const invalidUsername = await POST(
      request({ gameUrl: GAME_URL, username: "bad name" }),
    );
    expect(invalidUsername.status).toBe(400);
    expect(await bodyOf(invalidUsername)).toMatchObject({ code: "invalid-username" });
  });

  it("maps upstream 404, 410, 429 and 500 to useful statuses", async () => {
    const cases: Array<{
      upstream: number;
      expectedStatus: number;
      code: string;
      field: "archivesStatus" | "monthStatus";
    }> = [
      { upstream: 404, expectedStatus: 404, code: "not-found", field: "archivesStatus" },
      { upstream: 410, expectedStatus: 410, code: "gone", field: "archivesStatus" },
      { upstream: 429, expectedStatus: 429, code: "rate-limited", field: "monthStatus" },
      { upstream: 500, expectedStatus: 502, code: "upstream-error", field: "monthStatus" },
    ];
    for (const { upstream, expectedStatus, code, field } of cases) {
      const username = `status${upstream}${field.toLowerCase()}`;
      mockApi({ username, [field]: upstream });
      const response = await POST(request({ gameUrl: GAME_URL, username }));
      const payload = await bodyOf(response);
      expect(response.status).toBe(expectedStatus);
      expect(payload).toMatchObject({ status: "error", code });
    }
  });

  it("reports game-not-found when the game is absent", async () => {
    mockApi({ username: "absentuser" });
    const response = await POST(
      request({ gameUrl: GAME_URL, username: "absentuser" }),
    );
    expect(response.status).toBe(404);
    expect(await bodyOf(response)).toMatchObject({ code: "game-not-found" });
  });
});
