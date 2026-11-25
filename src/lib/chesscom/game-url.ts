import { ChesscomImportError } from "./errors";

export type ChesscomGameType = "live" | "daily";

export interface ParsedChesscomGameUrl {
  gameId: string;
  gameType: ChesscomGameType;
  canonicalUrl: string;
}

const ALLOWED_HOSTS = new Set(["www.chess.com", "chess.com"]);
const GAME_ID_PATTERN = /^[1-9]\d*$/;

/**
 * Parses a public Chess.com game URL using the native URL API.
 * The result is safe to use for lookups; it is never itself used as a fetch URL.
 */
export function parseChesscomGameUrl(input: string): ParsedChesscomGameUrl {
  const value = typeof input === "string" ? input.trim() : "";
  if (!value) {
    throw new ChesscomImportError("invalid-url", "Enter a Chess.com game URL.");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ChesscomImportError(
      "invalid-url",
      "That is not a valid URL. Paste a full Chess.com game link.",
    );
  }

  if (url.protocol !== "https:") {
    throw new ChesscomImportError(
      "invalid-url",
      "Chess.com game links must use https.",
    );
  }
  if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
    throw new ChesscomImportError(
      "invalid-url",
      "The link must point to chess.com, for example https://www.chess.com/game/live/123456789.",
    );
  }
  if (url.username || url.password || url.port) {
    throw new ChesscomImportError(
      "invalid-url",
      "Chess.com game links cannot contain credentials or a custom port.",
    );
  }

  const pathname = url.pathname.endsWith("/")
    ? url.pathname.slice(0, -1)
    : url.pathname;
  const segments = pathname.split("/").filter(Boolean);
  if (pathname !== `/${segments.join("/")}`) {
    throw new ChesscomImportError(
      "invalid-url",
      "That Chess.com path is not supported.",
    );
  }
  if (segments.length < 2 || segments[0] !== "game") {
    throw new ChesscomImportError(
      "invalid-url",
      "Use a game link such as /game/live/{id} or /game/daily/{id}.",
    );
  }

  const gameType = segments[1];
  if (gameType !== "live" && gameType !== "daily") {
    throw new ChesscomImportError(
      "invalid-url",
      `${gameType} games are not supported. Only live and daily games can be imported.`,
    );
  }

  if (segments.length !== 3) {
    throw new ChesscomImportError(
      "invalid-url",
      "The game ID in that link is missing or invalid.",
    );
  }

  const gameId = segments[2] ?? "";
  if (
    !GAME_ID_PATTERN.test(gameId) ||
    !Number.isSafeInteger(Number(gameId))
  ) {
    throw new ChesscomImportError(
      "invalid-url",
      "The game ID in that link is missing or invalid.",
    );
  }

  return {
    gameId,
    gameType,
    canonicalUrl: `https://www.chess.com/game/${gameType}/${gameId}`,
  };
}
