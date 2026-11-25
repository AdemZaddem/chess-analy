/**
 * Versioned local review records.
 *
 * Only the PGN and the small import descriptor are stored for the game; moves,
 * metadata and FENs are rebuilt with the existing chess.js parser on load.
 * Analysis snapshots are kept verbatim after structural validation.
 */
import { createAnalysisIdentity } from "@/lib/analysis/settings";
import type {
  AnalysisSettings,
  ClassificationThresholds,
  FullGameAnalysis,
} from "@/lib/analysis/types";
import type {
  GameSource,
  GameResult,
  NormalizedGame,
} from "@/lib/chess/types";
import { importPgn } from "@/lib/import/pgn-import-service";

export const REVIEW_SCHEMA_VERSION = 1;
export const MAX_STORED_PGN_CHARS = 500_000;
export const MAX_STORED_MOVES = 2_000;

export type ReviewAnalysisState =
  | "not-started"
  | "running"
  | "incomplete"
  | "complete";

export interface GameSnapshot {
  pgn: string;
  source: GameSource;
  gameCount: number;
  gameIndex: number;
}

export interface ReviewProgressSnapshot {
  analyzedPositions: number;
  totalPositions: number;
  percent: number;
}

export interface StoredReviewRecord {
  schemaVersion: typeof REVIEW_SCHEMA_VERSION;
  id: string;
  game: GameSnapshot;
  settings: AnalysisSettings;
  analysis: FullGameAnalysis | null;
  analysisState: ReviewAnalysisState;
  lastProgress?: ReviewProgressSnapshot;
  createdAt: number;
  updatedAt: number;
  lastAccessedAt: number;
}

export interface ReviewSummary {
  id: string;
  white: string;
  black: string;
  result: GameResult;
  date?: string;
  event?: string;
  plyCount: number;
  analysisState: ReviewAnalysisState;
  whiteAccuracy?: number;
  blackAccuracy?: number;
  createdAt: number;
  updatedAt: number;
  lastAccessedAt: number;
}

export interface LoadedReview {
  record: StoredReviewRecord;
  game: NormalizedGame;
  warnings: string[];
}

export type ReviewDataErrorCode =
  | "corrupt"
  | "unsupported-version"
  | "analysis-mismatch";

export class ReviewDataError extends Error {
  readonly code: ReviewDataErrorCode;

  constructor(code: ReviewDataErrorCode, message: string) {
    super(message);
    this.name = "ReviewDataError";
    this.code = code;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function integer(value: unknown, min: number, max: number): number | null {
  const parsed = finite(value);
  return parsed !== null && Number.isInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : null;
}

function text(value: unknown, max = 500): string | null {
  return typeof value === "string" && value.length <= max ? value : null;
}

function optionalText(value: unknown, max = 500): string | undefined {
  if (value === undefined || value === null) return undefined;
  return text(value, max) ?? undefined;
}

function hashText(value: string): string {
  const hash = (seed: number): string => {
    let result = seed >>> 0;
    for (let index = 0; index < value.length; index += 1) {
      result ^= value.charCodeAt(index);
      result = Math.imul(result, 0x01000193) >>> 0;
    }
    return result.toString(16).padStart(8, "0");
  };
  return `${hash(0x811c9dc5)}${hash(0x9e3779b9)}`;
}

/**
 * Chess.com games have a stable identifier. Other games are deduplicated by
 * their exact normalized PGN and starting position, never by player names.
 */
export function createReviewId(game: NormalizedGame): string {
  if (game.source.kind === "chesscom" && game.source.gameId) {
    return `chesscom:${game.source.gameType}:${game.source.gameId}`;
  }
  return `pgn:${hashText(`${game.initialFen}\n${game.pgn}\n${game.gameIndex}`)}`;
}

export function toGameSnapshot(game: NormalizedGame): GameSnapshot {
  return {
    pgn: game.pgn,
    source: { ...game.source },
    gameCount: game.gameCount,
    gameIndex: game.gameIndex,
  };
}

/**
 * Analysis identities include `game.id`, so every game entering persistence
 * must use the deterministic ID before the engine runs. Otherwise a completed
 * snapshot would be generated under a random import ID and rejected on load.
 */
export function withReviewId(game: NormalizedGame): NormalizedGame {
  const id = createReviewId(game);
  return id === game.id ? game : { ...game, id };
}

function parseSource(value: unknown): GameSource | null {
  if (!isRecord(value)) return null;
  switch (value.kind) {
    case "text":
      return { kind: "text" };
    case "file":
      return {
        kind: "file",
        filename: optionalText(value.filename, 300),
      };
    case "chesscom": {
      const gameId = text(value.gameId, 100);
      const username = text(value.username, 100);
      const gameType = value.gameType === "daily" ? "daily" : value.gameType === "live" ? "live" : null;
      if (!gameId || username === null || !gameType) return null;
      return {
        kind: "chesscom",
        gameId,
        username,
        gameType,
        gameUrl: text(value.gameUrl, 500) ?? `https://www.chess.com/game/${gameType}/${gameId}`,
      };
    }
    default:
      return null;
  }
}

function parseGameSnapshot(value: unknown): GameSnapshot | null {
  if (!isRecord(value)) return null;
  const pgn = text(value.pgn, MAX_STORED_PGN_CHARS);
  const source = parseSource(value.source);
  const gameCount = integer(value.gameCount, 1, 10_000);
  const gameIndex = integer(value.gameIndex, 1, 10_000);
  if (pgn === null || !source || !gameCount || !gameIndex || gameIndex > gameCount) {
    return null;
  }
  return { pgn, source, gameCount, gameIndex };
}

/** Rebuilds and validates a NormalizedGame from a compact persisted snapshot. */
export function rebuildGame(
  snapshot: GameSnapshot,
  expectedId?: string,
): NormalizedGame {
  const result = importPgn(snapshot.pgn, {
    source: snapshot.source,
    gameIndex: snapshot.gameIndex,
  });
  if (result.status !== "success") {
    throw new ReviewDataError(
      "corrupt",
      result.status === "error" ? result.message : "The saved PGN contains multiple games.",
    );
  }
  return {
    ...result.game,
    id: expectedId ?? createReviewId(result.game),
  };
}

export function parseAnalysisSettings(value: unknown): AnalysisSettings | null {
  if (!isRecord(value)) return null;
  const preset = value.preset;
  if (
    preset !== "custom" &&
    preset !== "quick" &&
    preset !== "standard" &&
    preset !== "deep"
  ) {
    return null;
  }
  const depth = integer(value.depth, 1, 30);
  const multiPv = integer(value.multiPv, 1, 1);
  if (!depth || !multiPv || value.bookClassification !== false) return null;

  const expectedPoints = value.expectedPoints;
  if (!isRecord(expectedPoints) || typeof expectedPoints.useEngineWdl !== "boolean") {
    return null;
  }
  const slope = finite(expectedPoints.centipawnSlope);
  if (slope === null || slope <= 0 || slope > 1) return null;

  const rawClassification = value.classification;
  if (!isRecord(rawClassification)) return null;
  const classification: ClassificationThresholds = {
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
    specialMoveMaxLoss: 0,
    sacrificeMaterialThreshold: 0,
    missedWinBefore: 0,
    missedWinAfter: 0,
    missedWinMinLoss: 0,
    brilliantAfter: 0,
    brilliantMinGain: 0,
    greatBeforeMax: 0,
    greatAfter: 0,
    greatMinGain: 0,
    greatComplexLegalMoves: 0,
    bestMaxLoss: 0,
    excellentMaxLoss: 0,
    uncertainThresholdMultiplier: 0,
  };
  for (const key of Object.keys(classification) as Array<keyof ClassificationThresholds>) {
    const parsed = finite(rawClassification[key]);
    if (parsed === null || parsed < 0 || parsed > 100) return null;
    classification[key] = parsed;
  }

  return {
    preset,
    depth,
    multiPv,
    expectedPoints: {
      useEngineWdl: expectedPoints.useEngineWdl,
      centipawnSlope: slope,
    },
    classification,
    bookClassification: false,
  };
}

const CLASSIFICATIONS = new Set([
  "brilliant",
  "great",
  "best",
  "excellent",
  "good",
  "book",
  "inaccuracy",
  "mistake",
  "blunder",
  "missedWin",
]);

function parseProgress(value: unknown): ReviewProgressSnapshot | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) return undefined;
  const analyzed = integer(value.analyzedPositions, 0, MAX_STORED_MOVES + 1);
  const total = integer(value.totalPositions, 0, MAX_STORED_MOVES + 1);
  const percent = finite(value.percent);
  if (!analyzed || !total || percent === null || percent < 0 || percent > 1) {
    return undefined;
  }
  return { analyzedPositions: analyzed, totalPositions: total, percent };
}

function validAnalysis(
  value: unknown,
  game: NormalizedGame,
  settings: AnalysisSettings,
): value is FullGameAnalysis {
  if (!isRecord(value)) return false;
  if (value.pgn !== game.pgn || value.initialFen !== game.initialFen) return false;
  if (!isRecord(value.identity) || typeof value.identity.key !== "string") return false;
  if (value.identity.key !== createAnalysisIdentity(game, settings).key) return false;
  const analysisSettings = parseAnalysisSettings(value.settings);
  if (
    !analysisSettings ||
    JSON.stringify(analysisSettings) !== JSON.stringify(settings)
  ) {
    return false;
  }

  const positions = value.positions;
  const moves = value.moves;
  if (!Array.isArray(positions) || !Array.isArray(moves)) return false;
  if (
    positions.length !== game.moves.length + 1 ||
    moves.length !== game.moves.length ||
    moves.length > MAX_STORED_MOVES
  ) {
    return false;
  }
  if (!positions.every((position, index) => {
    if (!isRecord(position) || integer(position.ply, 0, MAX_STORED_MOVES) !== index) return false;
    if (typeof position.fen !== "string" || position.fen.length > 500) return false;
    const evaluation = position.evaluation;
    if (!isRecord(evaluation)) return false;
    const expected = finite(evaluation.expectedPointsWhite);
    return expected !== null && expected >= 0 && expected <= 1;
  })) {
    return false;
  }
  if (!moves.every((move, index) => {
    if (!isRecord(move) || integer(move.ply, 1, MAX_STORED_MOVES) !== index + 1) return false;
    if (typeof move.san !== "string" || move.san.length > 20) return false;
    return typeof move.classification === "string" && CLASSIFICATIONS.has(move.classification);
  })) {
    return false;
  }

  const accuracy = value.accuracy;
  const counts = value.counts;
  if (!isRecord(accuracy) || !isRecord(counts)) return false;
  for (const color of ["white", "black"] as const) {
    const player = accuracy[color];
    if (!isRecord(player) || finite(player.accuracy) === null) return false;
  }
  for (const key of CLASSIFICATIONS) {
    const count = integer(counts[key], 0, MAX_STORED_MOVES);
    if (count === null) return false;
  }
  return (
    integer(value.startedAt, 0, Number.MAX_SAFE_INTEGER) !== null &&
    integer(value.completedAt, 0, Number.MAX_SAFE_INTEGER) !== null &&
    integer(value.durationMs, 0, Number.MAX_SAFE_INTEGER) !== null &&
    typeof value.incomplete === "boolean" &&
    Array.isArray(value.warnings) &&
    value.warnings.every((warning) => typeof warning === "string")
  );
}

function parseAnalysisState(value: unknown): ReviewAnalysisState {
  if (
    value === "not-started" ||
    value === "running" ||
    value === "incomplete" ||
    value === "complete"
  ) {
    return value;
  }
  return "not-started";
}

/** Older unversioned records are accepted only when their core shape is usable. */
export function migrateRecord(raw: unknown): Record<string, unknown> {
  if (!isRecord(raw)) {
    throw new ReviewDataError("corrupt", "The saved record is not an object.");
  }
  const version = raw.schemaVersion === undefined ? 0 : finite(raw.schemaVersion);
  if (version === null || version < 0) {
    throw new ReviewDataError("corrupt", "The saved schema version is invalid.");
  }
  if (version > REVIEW_SCHEMA_VERSION) {
    throw new ReviewDataError(
      "unsupported-version",
      `This review was saved with a newer format (v${version}). Update the app or export it from the original browser.`,
    );
  }
  if (version === 0) {
    // Recovery path for early unversioned records. Only the minimal game
    // snapshot can be trusted; derived fields are rebuilt below.
    const legacyGame =
      typeof raw.game === "string"
        ? { pgn: raw.game, source: { kind: "text" }, gameCount: 1, gameIndex: 1 }
        : raw.game;
    return {
      ...raw,
      schemaVersion: REVIEW_SCHEMA_VERSION,
      game: legacyGame,
      analysisState: raw.analysis ? "complete" : "not-started",
    };
  }
  return raw;
}

export function normalizeStoredRecord(raw: unknown): StoredReviewRecord {
  const candidate = migrateRecord(raw);
  const snapshot = parseGameSnapshot(candidate.game);
  const settings = parseAnalysisSettings(candidate.settings);
  if (!snapshot || !settings) {
    throw new ReviewDataError("corrupt", "The saved review is missing a valid game or settings.");
  }
  // The identifier is always re-derived so a tampered or stale key cannot
  // create two records for the same game.
  const game = rebuildGame(snapshot);
  const id = createReviewId(game);
  const now = Date.now();
  const createdAt = integer(candidate.createdAt, 0, Number.MAX_SAFE_INTEGER) ?? now;
  const updatedAt = integer(candidate.updatedAt, 0, Number.MAX_SAFE_INTEGER) ?? createdAt;
  const lastAccessedAt =
    integer(candidate.lastAccessedAt, 0, Number.MAX_SAFE_INTEGER) ?? updatedAt;

  let analysis: FullGameAnalysis | null = null;
  let analysisState = parseAnalysisState(candidate.analysisState);
  if (candidate.analysis !== null && candidate.analysis !== undefined) {
    if (!validAnalysis(candidate.analysis, game, settings)) {
      // A damaged snapshot must never appear as a completed review.
      analysisState = "incomplete";
    } else {
      analysis = candidate.analysis;
      analysisState = "complete";
    }
  } else if (analysisState === "complete") {
    analysisState = "incomplete";
  }

  return {
    schemaVersion: REVIEW_SCHEMA_VERSION,
    id,
    game: snapshot,
    settings,
    analysis,
    analysisState,
    ...(analysisState === "complete" || analysisState === "incomplete"
      ? { lastProgress: parseProgress(candidate.lastProgress) }
      : {}),
    createdAt,
    updatedAt: Math.max(updatedAt, createdAt),
    lastAccessedAt: Math.max(lastAccessedAt, createdAt),
  };
}

export function createReviewRecord(options: {
  game: NormalizedGame;
  settings: AnalysisSettings;
  analysis?: FullGameAnalysis | null;
  analysisState?: ReviewAnalysisState;
  lastProgress?: ReviewProgressSnapshot;
  createdAt?: number;
  updatedAt?: number;
  lastAccessedAt?: number;
}): StoredReviewRecord {
  const now = Date.now();
  const id = createReviewId(options.game);
  return normalizeStoredRecord({
    schemaVersion: REVIEW_SCHEMA_VERSION,
    id,
    game: toGameSnapshot(options.game),
    settings: options.settings,
    analysis: options.analysis ?? null,
    analysisState:
      options.analysisState ?? (options.analysis ? "complete" : "not-started"),
    ...(options.lastProgress ? { lastProgress: options.lastProgress } : {}),
    createdAt: options.createdAt ?? now,
    updatedAt: options.updatedAt ?? now,
    lastAccessedAt: options.lastAccessedAt ?? now,
  });
}

export function loadReview(record: StoredReviewRecord): LoadedReview {
  const warnings: string[] = [];
  let game: NormalizedGame;
  try {
    game = rebuildGame(record.game, record.id);
  } catch (error) {
    throw new ReviewDataError(
      "corrupt",
      error instanceof Error ? error.message : "The saved PGN could not be restored.",
    );
  }

  let analysis = record.analysis;
  let analysisState = record.analysisState;
  if (analysis && !validAnalysis(analysis, game, record.settings)) {
    analysis = null;
    analysisState = "incomplete";
    warnings.push("The saved analysis did not match this game and was not restored.");
  }
  return {
    record: { ...record, analysis, analysisState },
    game,
    warnings,
  };
}

export function summarizeReview(record: StoredReviewRecord): ReviewSummary | null {
  try {
    const { game } = loadReview(record);
    return {
      id: record.id,
      white: game.metadata.white.name,
      black: game.metadata.black.name,
      result: game.metadata.result,
      ...(game.metadata.date ? { date: game.metadata.date } : {}),
      ...(game.metadata.event ? { event: game.metadata.event } : {}),
      plyCount: game.moves.length,
      analysisState: record.analysisState,
      ...(record.analysis
        ? {
            whiteAccuracy: record.analysis.accuracy.white.accuracy,
            blackAccuracy: record.analysis.accuracy.black.accuracy,
          }
        : {}),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      lastAccessedAt: record.lastAccessedAt,
    };
  } catch {
    return null;
  }
}
