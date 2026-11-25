import { parsePgn, PgnParseError } from "@/lib/chess/pgn-parser";
import { ChesscomImportError } from "./errors";
import { parseChesscomGameUrl, type ParsedChesscomGameUrl } from "./game-url";
import {
  createPubApiClient,
  type PubApiClient,
  type PubApiClientOptions,
} from "./pubapi-client";
import { parsePlayerName, type PubApiGame } from "./pubapi-types";
import type { ChesscomImportSuccessResponse } from "./types";
import { normalizeChesscomUsername } from "./username";

export interface FindChesscomGameInput {
  gameUrl: string;
  username: string;
}

export interface FindChesscomGameOptions extends PubApiClientOptions {
  client?: PubApiClient;
}

interface ArchiveCandidate {
  url: string;
  year: number;
  month: number;
  index: number;
}

const ARCHIVE_URL_PATTERN = /\/games\/(\d{4})\/(\d{2})\/?$/;

function parseArchiveCandidate(url: string, index: number): ArchiveCandidate {
  const match = url.match(ARCHIVE_URL_PATTERN);
  if (!match) {
    throw new ChesscomImportError(
      "invalid-response",
      "Chess.com returned an invalid archive URL.",
    );
  }
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new ChesscomImportError(
      "invalid-response",
      "Chess.com returned an invalid archive URL.",
    );
  }
  return { url, year: Number(match[1]), month, index };
}

/** Newest first, deduplicated, and validated before any network calls. */
export function sortArchivesNewestFirst(archives: string[]): ArchiveCandidate[] {
  const unique = [...new Set(archives.map((entry) => entry.trim()))].filter(Boolean);
  const candidates = unique.map((url, index) => parseArchiveCandidate(url, index));
  return candidates.sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    if (a.month !== b.month) return b.month - a.month;
    return a.index - b.index;
  });
}

function parseGameIdFromUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (!["www.chess.com", "chess.com"].includes(url.hostname.toLowerCase())) {
      return null;
    }
    const segments = url.pathname.replace(/\/$/, "").split("/").filter(Boolean);
    if (segments.length !== 3 || segments[0] !== "game") return null;
    if (segments[1] !== "live" && segments[1] !== "daily") return null;
    const id = segments[2] ?? "";
    return /^[1-9]\d*$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

function expectedGameType(game: PubApiGame): "live" | "daily" | null {
  const url = game.url;
  if (typeof url !== "string") return null;
  const segments = url.split("/game/")[1]?.split("/");
  const type = segments?.[0];
  return type === "live" || type === "daily" ? type : null;
}

/** Reads the optional Link tag without introducing a second PGN parser. */
function readPgnLink(pgn: string): string | null {
  const match = pgn.match(/^\s*\[Link\s+"((?:[^"\\]|\\.)*)"\]\s*$/im);
  if (!match?.[1]) return null;
  return match[1].replace(/\\"/g, '"').trim() || null;
}

function isMissingArchive(error: unknown): boolean {
  return (
    error instanceof ChesscomImportError &&
    (error.code === "not-found" || error.code === "gone")
  );
}

/**
 * Retrieves and validates one public game through official monthly archives.
 * Callers should pass the result through the existing importPgn pipeline.
 */
export async function findChesscomGame(
  input: FindChesscomGameInput,
  options: FindChesscomGameOptions = {},
): Promise<ChesscomImportSuccessResponse> {
  const parsedUrl: ParsedChesscomGameUrl = parseChesscomGameUrl(input.gameUrl);
  const username = normalizeChesscomUsername(input.username);
  const client = options.client ?? createPubApiClient(options);

  const archives = await client.getArchives(username);
  const candidates = sortArchivesNewestFirst(archives);
  if (!candidates.length) {
    throw new ChesscomImportError(
      "game-not-found",
      "Chess.com has no archived games for that username. Check the username and try again.",
    );
  }

  for (const archive of candidates) {
    let games;
    try {
      games = await client.getMonthlyGames(archive.url);
    } catch (error) {
      // Some listed monthly archives may not exist yet; keep searching older ones.
      if (isMissingArchive(error)) continue;
      throw error;
    }

    for (const game of games) {
      const gameId = parseGameIdFromUrl(game.url);
      if (gameId !== parsedUrl.gameId) continue;
      if (expectedGameType(game) !== parsedUrl.gameType) continue;

      const rules = typeof game.rules === "string" ? game.rules.trim() : "";
      if (rules !== "chess") {
        throw new ChesscomImportError(
          "unsupported-variant",
          `That game uses Chess.com rules "${rules || "unknown"}". Only standard chess games are supported.`,
        );
      }

      const pgn = typeof game.pgn === "string" ? game.pgn.trim() : "";
      if (!pgn) {
        throw new ChesscomImportError(
          "game-unavailable",
          "Chess.com did not provide a PGN for that game. It may be private or unavailable.",
        );
      }

      try {
        parsePgn(pgn);
      } catch (error) {
        if (error instanceof PgnParseError) {
          throw new ChesscomImportError(
            "invalid-pgn",
            `Chess.com returned a PGN that could not be parsed: ${error.message}`,
            { cause: error },
          );
        }
        throw error;
      }

      const canonicalUrl = parsedUrl.canonicalUrl;
      const pgnLink = readPgnLink(pgn);
      if (pgnLink) {
        let linkedGame: ParsedChesscomGameUrl;
        try {
          linkedGame = parseChesscomGameUrl(pgnLink);
        } catch {
          throw new ChesscomImportError(
            "game-mismatch",
            "The returned PGN does not identify the requested Chess.com game.",
          );
        }
        if (
          linkedGame.gameId !== parsedUrl.gameId ||
          linkedGame.gameType !== parsedUrl.gameType
        ) {
          throw new ChesscomImportError(
            "game-mismatch",
            "The returned PGN identifies a different Chess.com game than the one requested.",
          );
        }
      }

      return {
        status: "success",
        pgn,
        gameUrl: canonicalUrl,
        metadata: {
          gameUrl: canonicalUrl,
          gameId: parsedUrl.gameId,
          gameType: parsedUrl.gameType,
          rules,
          timeClass:
            typeof game.time_class === "string" ? game.time_class : undefined,
          white: parsePlayerName(game.white),
          black: parsePlayerName(game.black),
        },
        source: {
          kind: "chesscom",
          gameUrl: canonicalUrl,
          username,
          gameId: parsedUrl.gameId,
          gameType: parsedUrl.gameType,
        },
      };
    }
  }

  throw new ChesscomImportError(
    "game-not-found",
    "That game was not found in the supplied player's public archives. Check the URL and username, or try the other player's username.",
  );
}
