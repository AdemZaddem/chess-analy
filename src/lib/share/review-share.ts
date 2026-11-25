/**
 * Share links carry the PGN in the URL fragment. Fragments are not sent to the
 * web server; the recipient recreates the game locally and analyzes it with
 * their own browser engine. No analysis snapshot is embedded in the link.
 */
import type { AnalysisPreset, AnalysisSettings } from "@/lib/analysis/types";
import { createAnalysisSettings } from "@/lib/analysis/settings";
import { splitPgnGames } from "@/lib/chess/pgn-split";
import type { GameResult, NormalizedGame } from "@/lib/chess/types";
import { importPgn } from "@/lib/import/pgn-import-service";
import { createReviewId } from "@/lib/storage/schema";

export const REVIEW_SHARE_FRAGMENT = "review";
export const REVIEW_SHARE_VERSION = 1;
export const MAX_SHARE_URL_LENGTH = 8_000;
export const MAX_SHARE_PGN_CHARS = 300_000;
/** A small gzip link must not be able to expand without a local ceiling. */
export const MAX_SHARE_DECOMPRESSED_BYTES = 1_000_000;

export interface ShareMetadata {
  white: string;
  black: string;
  date?: string;
  result?: GameResult;
}

export interface ShareSource {
  kind: "chesscom";
  gameId: string;
  gameType: "live" | "daily";
}

export interface ReviewSharePayload {
  v: typeof REVIEW_SHARE_VERSION;
  pgn: string;
  preset: AnalysisPreset;
  depth: number;
  meta?: ShareMetadata;
  source?: ShareSource;
}

export type ShareErrorCode =
  | "invalid"
  | "unsupported-version"
  | "decode-failed"
  | "too-large";

export class ReviewShareError extends Error {
  readonly code: ShareErrorCode;

  constructor(code: ShareErrorCode, message: string) {
    super(message);
    this.name = "ReviewShareError";
    this.code = code;
  }
}

export type ShareEncoding = "gzip" | "plain";

export interface EncodedShare {
  hash: string;
  url: string;
  encoding: ShareEncoding;
  urlLength: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, max: number): string | null {
  return typeof value === "string" && value.length <= max ? value : null;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8_192;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) {
    throw new ReviewShareError("invalid", "The share link contains invalid characters.");
  }
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new ReviewShareError("decode-failed", "The share link could not be decoded.");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** Compressed links are only created when they can also be decoded locally. */
export function hasCompressedShareSupport(): boolean {
  return (
    typeof CompressionStream !== "undefined" &&
    typeof DecompressionStream !== "undefined"
  );
}

async function compress(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (!hasCompressedShareSupport()) return null;
  try {
    const stream = new Blob([bytes as BlobPart])
      .stream()
      .pipeThrough(new CompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

async function decompress(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new ReviewShareError(
      "unsupported-version",
      "This browser cannot open compressed share links. Ask for a plain link or an exported review file instead.",
    );
  }
  try {
    const stream = new Blob([bytes as BlobPart])
      .stream()
      .pipeThrough(new DecompressionStream("gzip"));
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_SHARE_DECOMPRESSED_BYTES) {
        await reader.cancel();
        throw new ReviewShareError(
          "too-large",
          "This share link expands beyond the supported size. Export the review file instead.",
        );
      }
      chunks.push(value);
    }
    const output = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return output;
  } catch (error) {
    if (error instanceof ReviewShareError) throw error;
    throw new ReviewShareError("decode-failed", "The compressed share link is damaged.");
  }
}

export function createReviewSharePayload(
  game: NormalizedGame,
  settings: AnalysisSettings,
): ReviewSharePayload {
  const payload: ReviewSharePayload = {
    v: REVIEW_SHARE_VERSION,
    pgn: game.pgn,
    preset: settings.preset,
    depth: settings.depth,
  };

  const white = boundedText(game.metadata.white.name, 120);
  const black = boundedText(game.metadata.black.name, 120);
  if (white && black) {
    payload.meta = {
      white,
      black,
      ...(game.metadata.date ? { date: boundedText(game.metadata.date, 40) ?? undefined } : {}),
      ...(game.metadata.result ? { result: game.metadata.result } : {}),
    };
  }
  if (game.source.kind === "chesscom") {
    payload.source = {
      kind: "chesscom",
      gameId: game.source.gameId,
      gameType: game.source.gameType,
    };
  }
  return payload;
}

export function parseReviewSharePayload(value: unknown): ReviewSharePayload {
  if (!isRecord(value)) {
    throw new ReviewShareError("invalid", "This share link does not contain a review.");
  }
  if (value.v !== REVIEW_SHARE_VERSION) {
    throw new ReviewShareError(
      "unsupported-version",
      "This share link uses a newer format. Ask for an exported review file instead.",
    );
  }
  const pgn = boundedText(value.pgn, MAX_SHARE_PGN_CHARS);
  if (!pgn || !pgn.trim()) {
    throw new ReviewShareError("invalid", "The share link has no PGN to load.");
  }
  const preset = value.preset;
  if (preset !== "quick" && preset !== "standard" && preset !== "deep") {
    throw new ReviewShareError("invalid", "The share link has invalid analysis settings.");
  }
  const depth = value.depth;
  if (typeof depth !== "number" || !Number.isInteger(depth) || depth < 1 || depth > 30) {
    throw new ReviewShareError("invalid", "The share link has an invalid analysis depth.");
  }

  const payload: ReviewSharePayload = { v: REVIEW_SHARE_VERSION, pgn, preset, depth };
  if (value.meta !== undefined) {
    if (!isRecord(value.meta)) {
      throw new ReviewShareError("invalid", "The share link has invalid game metadata.");
    }
    const white = boundedText(value.meta.white, 120);
    const black = boundedText(value.meta.black, 120);
    if (!white || !black) {
      throw new ReviewShareError("invalid", "The share link has invalid player names.");
    }
    const result = value.meta.result;
    payload.meta = {
      white,
      black,
      ...(value.meta.date === undefined
        ? {}
        : { date: boundedText(value.meta.date, 40) ?? undefined }),
      ...(result === "1-0" ||
      result === "0-1" ||
      result === "1/2-1/2" ||
      result === "*"
        ? { result }
        : {}),
    };
  }
  if (value.source !== undefined) {
    if (
      !isRecord(value.source) ||
      value.source.kind !== "chesscom" ||
      !boundedText(value.source.gameId, 100) ||
      (value.source.gameType !== "live" && value.source.gameType !== "daily")
    ) {
      throw new ReviewShareError("invalid", "The share link has an invalid game source.");
    }
    payload.source = {
      kind: "chesscom",
      gameId: value.source.gameId as string,
      gameType: value.source.gameType,
    };
  }
  return payload;
}

export function settingsFromSharePayload(payload: ReviewSharePayload): AnalysisSettings {
  const preset = payload.preset as "quick" | "standard" | "deep";
  return createAnalysisSettings(preset);
}

/** Encodes a validated payload into `#review=v1.<g|p>.<base64url>`. */
export async function encodeReviewShareHash(
  payload: ReviewSharePayload,
  options: { compress?: boolean } = {},
): Promise<{ hash: string; encoding: ShareEncoding }> {
  const parsed = parseReviewSharePayload(payload);
  const json = new TextEncoder().encode(JSON.stringify(parsed));
  const useCompression = options.compress !== false;
  const compressed = useCompression ? await compress(json) : null;
  const data = compressed ?? json;
  const encoding: ShareEncoding = compressed ? "gzip" : "plain";
  return {
    hash: `${REVIEW_SHARE_FRAGMENT}=v1.${encoding === "gzip" ? "g" : "p"}.${bytesToBase64Url(data)}`,
    encoding,
  };
}

export async function decodeReviewShareHash(
  hashOrUrl: string,
): Promise<ReviewSharePayload> {
  const trimmed = hashOrUrl.trim();
  const hash = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  const marker = `${REVIEW_SHARE_FRAGMENT}=`;
  const value = hash.startsWith(marker) ? hash.slice(marker.length) : hash;
  const [version, encoding, data, ...extra] = value.split(".");
  if (version !== "v1" || extra.length > 0 || !data) {
    throw new ReviewShareError(
      version && version !== "v1" ? "unsupported-version" : "invalid",
      "This is not a valid review share link.",
    );
  }
  if (hash.length > MAX_SHARE_URL_LENGTH) {
    throw new ReviewShareError(
      "too-large",
      "This share link is too large to open. Ask for an exported review file instead.",
    );
  }
  let bytes = base64UrlToBytes(data);
  if (encoding === "g") bytes = await decompress(bytes);
  else if (encoding !== "p") {
    throw new ReviewShareError("invalid", "This share link uses an unknown encoding.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ReviewShareError("decode-failed", "The share link is malformed.");
  }
  return parseReviewSharePayload(parsed);
}

export async function buildReviewShareUrl(
  payload: ReviewSharePayload,
  options: {
    baseUrl?: string;
    compress?: boolean;
    maxUrlLength?: number;
  } = {},
): Promise<EncodedShare> {
  const { hash, encoding } = await encodeReviewShareHash(payload, options);
  const base = options.baseUrl ?? (typeof window === "undefined" ? "http://localhost/" : window.location.href);
  const url = new URL(base);
  url.hash = hash;
  const shareUrl = url.toString();
  const limit = options.maxUrlLength ?? MAX_SHARE_URL_LENGTH;
  if (shareUrl.length > limit) {
    throw new ReviewShareError(
      "too-large",
      `This game is too large for a share link (${shareUrl.length.toLocaleString()} characters, limit ${limit.toLocaleString()}). Export the review file instead.`,
    );
  }
  return { hash, url: shareUrl, encoding, urlLength: shareUrl.length };
}

export interface LoadedShare {
  payload: ReviewSharePayload;
  game: NormalizedGame;
  settings: AnalysisSettings;
}

/** Decodes, validates and reconstructs a game. No analysis is included. */
export async function loadSharedReview(
  hashOrUrl: string,
): Promise<LoadedShare> {
  const payload = await decodeReviewShareHash(hashOrUrl);
  // Share links intentionally carry a single game. Importing by index here
  // would silently hide the other games in a multi-game payload.
  if (splitPgnGames(payload.pgn).length > 1) {
    throw new ReviewShareError(
      "invalid",
      "This share link contains multiple games. Use an exported review file instead.",
    );
  }
  const source = payload.source
    ? {
        kind: "chesscom" as const,
        gameId: payload.source.gameId,
        gameType: payload.source.gameType,
        username: "",
        gameUrl: `https://www.chess.com/game/${payload.source.gameType}/${payload.source.gameId}`,
      }
    : ({ kind: "text" } as const);
  const imported = importPgn(payload.pgn, { source, gameIndex: 1 });
  if (imported.status !== "success") {
    throw new ReviewShareError(
      "invalid",
      imported.status === "error"
        ? imported.message
        : "The shared PGN contains multiple games.",
    );
  }
  const game: NormalizedGame = {
    ...imported.game,
    id: createReviewId(imported.game),
    warnings: [
      ...imported.game.warnings,
      "Loaded from a share link. Analysis is not included; run it locally when ready.",
    ],
  };
  if (payload.meta) {
    if (game.metadata.white.name === "Unknown player" && payload.meta.white) {
      game.metadata.white.name = payload.meta.white;
    }
    if (game.metadata.black.name === "Unknown player" && payload.meta.black) {
      game.metadata.black.name = payload.meta.black;
    }
    if (!game.metadata.date && payload.meta.date) game.metadata.date = payload.meta.date;
    if (game.metadata.result === "*" && payload.meta.result) {
      game.metadata.result = payload.meta.result;
    }
  }
  return { payload, game, settings: settingsFromSharePayload(payload) };
}
