import { parsePgn, PgnParseError } from "../chess/pgn-parser";
import type { PgnParseErrorKind } from "../chess/pgn-parser";
import { splitPgnGames } from "../chess/pgn-split";
import type {
  GamePreview,
  GameSource,
  NormalizedGame,
} from "../chess/types";

export type PgnImportSource = GameSource;

export interface PgnImportSuccess {
  status: "success";
  game: NormalizedGame;
}

export interface PgnImportMultiple {
  status: "multiple-games";
  games: GamePreview[];
  source: PgnImportSource;
}

export interface PgnImportFailure {
  status: "error";
  kind: PgnParseErrorKind | "selection";
  message: string;
  gameIndex?: number;
}

export type PgnImportResult =
  | PgnImportSuccess
  | PgnImportMultiple
  | PgnImportFailure;

function failure(
  kind: PgnImportFailure["kind"],
  message: string,
  gameIndex?: number,
): PgnImportFailure {
  return { status: "error", kind, message, gameIndex };
}

function describeError(error: unknown): string {
  if (error instanceof PgnParseError) return error.message;
  return error instanceof Error ? error.message : "Unknown parsing error";
}

/**
 * Entry point for PGN imports. When a document contains several games, the
 * caller must explicitly choose one by passing `gameIndex`.
 */
export function importPgn(
  input: string,
  options: {
    source?: PgnImportSource;
    gameIndex?: number;
  } = {},
): PgnImportResult {
  const source = options.source ?? { kind: "text" };

  if (!input.trim()) {
    return failure("empty", "The PGN is empty. Paste PGN notation or choose a .pgn file.");
  }

  const chunks = splitPgnGames(input);
  if (chunks.length === 0) {
    return failure("empty", "The PGN is empty. Paste PGN notation or choose a .pgn file.");
  }

  if (chunks.length > 1 && options.gameIndex === undefined) {
    const games: GamePreview[] = [];
    for (const [offset, chunk] of chunks.entries()) {
      try {
        const game = parsePgn(chunk);
        games.push({
          index: offset + 1,
          white: game.metadata.white.name,
          black: game.metadata.black.name,
          result: game.metadata.result,
          plyCount: game.moves.length,
          opening: game.metadata.opening,
        });
      } catch (error) {
        return failure(
          error instanceof PgnParseError ? error.kind : "invalid",
          `Game ${offset + 1} could not be parsed: ${describeError(error)}`,
          offset + 1,
        );
      }
    }
    return { status: "multiple-games", games, source };
  }

  const gameIndex = options.gameIndex ?? 1;
  if (
    !Number.isInteger(gameIndex) ||
    gameIndex < 1 ||
    gameIndex > chunks.length
  ) {
    return failure(
      "selection",
      `Game ${gameIndex} does not exist in this PGN document (${chunks.length} game${chunks.length === 1 ? "" : "s"} found).`,
    );
  }

  try {
    const game = parsePgn(chunks[gameIndex - 1] ?? "");
    return {
      status: "success",
      game: {
        ...game,
        source,
        gameCount: chunks.length,
        gameIndex,
        warnings:
          chunks.length > 1
            ? [
                `This PGN contains ${chunks.length} games. Showing game ${gameIndex}.`,
              ]
            : [],
      },
    };
  } catch (error) {
    const prefix = chunks.length > 1 ? `Game ${gameIndex}: ` : "";
    return failure(
      error instanceof PgnParseError ? error.kind : "invalid",
      `${prefix}${describeError(error)}`,
      gameIndex,
    );
  }
}
