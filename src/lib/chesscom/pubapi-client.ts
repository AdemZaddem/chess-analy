import { ChesscomImportError } from "./errors";
import {
  parseArchivesResponse,
  parseMonthlyGamesResponse,
  type PubApiGame,
} from "./pubapi-types";
import { normalizeChesscomUsername } from "./username";

export const PUBAPI_BASE_URL = "https://api.chess.com/pub/";
export const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

/** Small in-memory conditional GET cache. It is process-local and never persisted. */
interface CacheEntry {
  etag?: string;
  lastModified?: string;
  value: unknown;
}
const responseCache = new Map<string, CacheEntry>();

export interface PubApiClientOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  userAgent?: string;
  cache?: Map<string, CacheEntry>;
}

export interface PubApiClient {
  getArchives(username: string): Promise<string[]>;
  getMonthlyGames(archiveUrl: string): Promise<PubApiGame[]>;
  clearCache(): void;
}

function buildUserAgent(): string {
  const contact = process.env.CHESSCOM_API_CONTACT?.trim();
  return contact
    ? `MoveLens/1.0 (chess game import; contact: ${contact})`
    : "MoveLens/1.0 (chess game import; https://github.com/)";
}

/** Only accepts URLs returned by the official archives endpoint. */
export function validateArchiveUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ChesscomImportError(
      "invalid-response",
      "Chess.com returned an invalid archive URL.",
    );
  }

  const base = new URL(PUBAPI_BASE_URL);
  if (
    url.protocol !== base.protocol ||
    url.hostname !== base.hostname ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    url.search
  ) {
    throw new ChesscomImportError(
      "invalid-response",
      "Chess.com returned an archive URL outside the official API.",
    );
  }

  const match = url.pathname.match(/^\/pub\/player\/([a-z0-9_-]{1,25})\/games\/(\d{4})\/(\d{2})$/);
  if (!match) {
    throw new ChesscomImportError(
      "invalid-response",
      "Chess.com returned an unsupported archive URL.",
    );
  }
  const [, username, year, month] = match;
  const monthNumber = Number(month);
  if (monthNumber < 1 || monthNumber > 12) {
    throw new ChesscomImportError(
      "invalid-response",
      "Chess.com returned an invalid monthly archive URL.",
    );
  }

  const expectedPath = `/pub/player/${username}/games/${year}/${month}`;
  if (url.pathname !== expectedPath) {
    throw new ChesscomImportError(
      "invalid-response",
      "Chess.com returned an invalid monthly archive URL.",
    );
  }
  return url;
}

function retryAfterHeader(response: Response): string | undefined {
  const value = response.headers.get("retry-after");
  return value ?? undefined;
}

function statusError(status: number, retryAfter?: string): ChesscomImportError {
  if (status === 404) {
    return new ChesscomImportError(
      "not-found",
      "The requested Chess.com data was not found.",
      { status },
    );
  }
  if (status === 410) {
    return new ChesscomImportError(
      "gone",
      "Chess.com no longer provides the requested data.",
      { status },
    );
  }
  if (status === 429) {
    const suffix = retryAfter
      ? ` Retry after ${retryAfter} seconds.`
      : " Please wait before trying again.";
    return new ChesscomImportError(
      "rate-limited",
      `Chess.com is rate limiting requests.${suffix}`,
      { status, retryAfter },
    );
  }
  if (status >= 500) {
    return new ChesscomImportError(
      "upstream-error",
      `Chess.com is temporarily unavailable (HTTP ${status}).`,
      { status },
    );
  }
  return new ChesscomImportError(
    "upstream-error",
    `Chess.com returned an unexpected HTTP ${status} response.`,
    { status },
  );
}

export function createPubApiClient(options: PubApiClientOptions = {}): PubApiClient {
  const doFetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const userAgent = options.userAgent ?? buildUserAgent();
  const cache = options.cache ?? responseCache;

  async function getJson(url: URL, parse: (value: unknown) => unknown): Promise<unknown> {
    const key = url.toString();
    const cached = cache.get(key);
    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": userAgent,
    };
    if (cached?.etag) headers["If-None-Match"] = cached.etag;
    if (cached?.lastModified) headers["If-Modified-Since"] = cached.lastModified;

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    let response: Response;
    try {
      response = await doFetch(key, {
        headers,
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (error) {
      if (timedOut) {
        throw new ChesscomImportError(
          "timeout",
          `Chess.com did not respond within ${Math.round(timeoutMs / 1000)} seconds. Try again shortly.`,
          { cause: error },
        );
      }
      throw new ChesscomImportError(
        "network-error",
        "Could not connect to Chess.com. Check your connection and try again.",
        { cause: error },
      );
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 304) {
      if (!cached) {
        throw new ChesscomImportError(
          "invalid-response",
          "Chess.com returned an unexpected cache response.",
          { status: 304 },
        );
      }
      cache.set(key, { ...cached, etag: cached.etag, lastModified: cached.lastModified });
      return cached.value;
    }

    if (!response.ok) {
      throw statusError(response.status, retryAfterHeader(response));
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      throw new ChesscomImportError(
        "invalid-json",
        "Chess.com returned data that could not be read.",
        { status: response.status, cause: error },
      );
    }

    let value: unknown;
    try {
      value = parse(body);
    } catch (error) {
      if (error instanceof ChesscomImportError) throw error;
      throw new ChesscomImportError("invalid-response", "Chess.com returned an invalid response.", {
        cause: error,
      });
    }

    cache.set(key, {
      etag: response.headers.get("etag") ?? undefined,
      lastModified: response.headers.get("last-modified") ?? undefined,
      value,
    });
    return value;
  }

  return {
    getArchives(username: string): Promise<string[]> {
      const safeUsername = normalizeChesscomUsername(username);
      const url = new URL(
        `${PUBAPI_BASE_URL}player/${encodeURIComponent(safeUsername)}/games/archives`,
      );
      return getJson(url, (body) => {
        const archives = parseArchivesResponse(body);
        if (!archives) {
          throw new ChesscomImportError(
            "invalid-response",
            "Chess.com returned an invalid archives list.",
          );
        }
        return archives;
      }) as Promise<string[]>;
    },

    getMonthlyGames(archiveUrl: string): Promise<PubApiGame[]> {
      const url = validateArchiveUrl(archiveUrl);
      return getJson(url, (body) => {
        const games = parseMonthlyGamesResponse(body);
        if (!games) {
          throw new ChesscomImportError(
            "invalid-response",
            "Chess.com returned an invalid monthly archive.",
          );
        }
        return games;
      }) as Promise<PubApiGame[]>;
    },

    clearCache(): void {
      cache.clear();
    },
  };
}
