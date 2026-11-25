import { Chess, DEFAULT_POSITION } from "chess.js";
import type {
  GameMetadata,
  GameResult,
  MoveRecord,
  ParsedGame,
  PlayerInfo,
} from "./types";

export type PgnParseErrorKind =
  | "empty"
  | "invalid"
  | "unsupported-variant";

export class PgnParseError extends Error {
  readonly kind: PgnParseErrorKind;

  constructor(
    kind: PgnParseErrorKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "PgnParseError";
    this.kind = kind;
  }
}

const PLACEHOLDERS = new Set(["?", "??", "????.??.??", ""]);
const TITLE_PATTERN = /^(WGM|WIM|WFM|WCM|GM|IM|FM|CM)\s+(.+)$/;

function cleanHeader(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && !PLACEHOLDERS.has(trimmed) ? trimmed : undefined;
}

function readHeaderValue(pgn: string, tag: string): string | undefined {
  const pattern = new RegExp(
    `^\\s*\\[${tag}\\s+"((?:[^"\\\\]|\\\\.)*)"\\]\\s*$`,
    "im",
  );
  const value = pgn.match(pattern)?.[1];
  return value?.replace(/\\"/g, '"');
}

function parseRating(value: string | undefined): number | undefined {
  const cleaned = cleanHeader(value);
  if (!cleaned) return undefined;
  const match = cleaned.match(/\d{3,4}/);
  const rating = match ? Number(match[0]) : undefined;
  return rating !== undefined && rating >= 100 && rating <= 4000
    ? rating
    : undefined;
}

function parsePlayer(
  nameValue: string | undefined,
  ratingValue: string | undefined,
): PlayerInfo {
  let name = cleanHeader(nameValue) ?? "Unknown player";
  let rating = parseRating(ratingValue);
  let title: string | undefined;

  const parenthesized = name.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (parenthesized) {
    const inlineRating = parseRating(parenthesized[2]);
    if (inlineRating !== undefined) {
      rating ??= inlineRating;
      name = parenthesized[1].trim();
    }
  }

  const titled = name.match(TITLE_PATTERN);
  if (titled) {
    title = titled[1];
    name = titled[2].trim();
  }

  return {
    name: name || "Unknown player",
    rating,
    title,
  };
}

function parseResult(value: string | undefined): GameResult {
  const cleaned = cleanHeader(value);
  if (
    cleaned === "1-0" ||
    cleaned === "0-1" ||
    cleaned === "1/2-1/2" ||
    cleaned === "*"
  ) {
    return cleaned;
  }
  return "*";
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown parsing error";
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `game-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function validateStartingPosition(pgn: string, fenHeader?: string): string {
  const variant = cleanHeader(readHeaderValue(pgn, "Variant"));
  if (variant && !/^standard$/i.test(variant)) {
    throw new PgnParseError(
      "unsupported-variant",
      `Unsupported chess variant "${variant}". Only standard chess is supported.`,
    );
  }

  if (fenHeader) {
    const castlingRights = fenHeader.split(" ")[2] ?? "-";
    if (/[^KQkq-]/.test(castlingRights)) {
      throw new PgnParseError(
        "unsupported-variant",
        "This PGN uses a non-standard starting position (such as Chess960) that cannot be analyzed as standard chess.",
      );
    }
  }

  const source = fenHeader ?? DEFAULT_POSITION;
  try {
    return new Chess(source).fen();
  } catch (error) {
    throw new PgnParseError(
      "invalid",
      `Invalid starting position: ${describeError(error)}`,
      { cause: error },
    );
  }
}

function buildMetadata(headers: Record<string, string>): GameMetadata {
  return {
    event: cleanHeader(headers.Event),
    site: cleanHeader(headers.Site),
    date: cleanHeader(headers.Date),
    round: cleanHeader(headers.Round),
    white: parsePlayer(headers.White, headers.WhiteElo ?? headers.WhiteRating),
    black: parsePlayer(headers.Black, headers.BlackElo ?? headers.BlackRating),
    result: parseResult(headers.Result),
    timeControl: cleanHeader(headers.TimeControl),
    eco: cleanHeader(headers.ECO),
    opening: cleanHeader(headers.Opening),
  };
}

/** Parses one PGN game. Throws PgnParseError with a user-facing message. */
export function parsePgn(input: string): ParsedGame {
  const pgn = input.replace(/^\uFEFF/, "").trim();

  if (!pgn) {
    throw new PgnParseError(
      "empty",
      "The PGN is empty. Paste PGN notation or choose a .pgn file.",
    );
  }

  const fenHeader = cleanHeader(readHeaderValue(pgn, "FEN"));
  const initialFen = validateStartingPosition(pgn, fenHeader);

  const chess = new Chess();
  try {
    chess.loadPgn(pgn);
  } catch (error) {
    throw new PgnParseError(
      "invalid",
      `Could not parse this PGN: ${describeError(error)}`,
      { cause: error },
    );
  }

  const headers = chess.getHeaders();
  const metadata = buildMetadata(headers);

  const comments = new Map<string, string>();
  for (const entry of chess.getComments()) {
    const comment = entry.comment.trim();
    if (comment) comments.set(entry.fen, comment);
  }

  const fullmove = Number(initialFen.split(" ")[5] ?? "1") || 1;
  const startsWithBlack = initialFen.split(" ")[1] === "b";
  const moves: MoveRecord[] = chess.history({ verbose: true }).map((move, index) => ({
    ply: index + 1,
    moveNumber:
      fullmove + Math.floor((index + (startsWithBlack ? 1 : 0)) / 2),
    color: move.color,
    san: move.san,
    from: move.from,
    to: move.to,
    promotion: move.promotion,
    fen: move.after,
    comment: comments.get(move.after),
  }));

  return {
    id: createId(),
    initialFen,
    metadata,
    moves,
    pgn: chess.pgn(),
  };
}
