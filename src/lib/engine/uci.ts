import type { EngineScore } from "./types";

export type UciScoreKind = "cp" | "mate";

export interface UciScore {
  kind: UciScoreKind;
  value: number;
}

/** UCI win/draw/loss counts in per-mille, from the side to move's perspective. */
export interface UciWdl {
  win: number;
  draw: number;
  loss: number;
}

export interface UciInfo {
  depth?: number;
  selectiveDepth?: number;
  multipv?: number;
  score?: UciScore;
  nodes?: number;
  nps?: number;
  hashfull?: number;
  timeMs?: number;
  /** Side-to-move WDL counts supplied by UCI_ShowWDL, in per-mille. */
  wdl?: UciWdl;
  pv: string[];
  raw: string;
}

export interface UciBestMove {
  move: string | null;
  ponder?: string;
  raw: string;
}

/** Keywords that can follow `pv`; used to stop PV collection without fixed positions. */
const INFO_KEYWORDS = new Set([
  "info",
  "depth",
  "seldepth",
  "multipv",
  "score",
  "cp",
  "mate",
  "nodes",
  "nps",
  "hashfull",
  "tbhits",
  "time",
  "pv",
  "currmove",
  "currmovenumber",
  "string",
  "wdl",
  "searchmoves",
  "refutation",
]);

export function tokenize(line: string): string[] {
  return line.trim().split(/\s+/).filter(Boolean);
}

function integerAt(tokens: string[], index: number): number | undefined {
  const value = Number(tokens[index]);
  return Number.isFinite(value) ? Math.trunc(value) : undefined;
}

function wdlAt(tokens: string[], index: number): UciWdl | undefined {
  const win = integerAt(tokens, index);
  const draw = integerAt(tokens, index + 1);
  const loss = integerAt(tokens, index + 2);
  if (
    win === undefined ||
    draw === undefined ||
    loss === undefined ||
    win < 0 ||
    draw < 0 ||
    loss < 0 ||
    win + draw + loss <= 0
  ) {
    return undefined;
  }
  return { win, draw, loss };
}

export function isUciOk(line: string): boolean {
  return line.trim() === "uciok";
}

export function isReadyOk(line: string): boolean {
  return line.trim() === "readyok";
}

export function parseIdName(line: string): string | undefined {
  const tokens = tokenize(line);
  if (tokens[0] !== "id" || tokens[1] !== "name") return undefined;
  return tokens.slice(2).join(" ") || undefined;
}

export function parseIdAuthor(line: string): string | undefined {
  const tokens = tokenize(line);
  if (tokens[0] !== "id" || tokens[1] !== "author") return undefined;
  return tokens.slice(2).join(" ") || undefined;
}

export function parseVersion(name: string | undefined): string | undefined {
  return name?.match(/\bStockfish\s+(\d+(?:\.\d+)?)/i)?.[1];
}

export function parseUciInfo(line: string): UciInfo | null {
  const tokens = tokenize(line);
  if (tokens[0] !== "info") return null;
  if (tokens[1] === "string") return null;

  const info: UciInfo = { pv: [], raw: line };
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    switch (token) {
      case "depth":
        info.depth = integerAt(tokens, index + 1);
        index += 1;
        break;
      case "seldepth":
        info.selectiveDepth = integerAt(tokens, index + 1);
        index += 1;
        break;
      case "multipv":
        info.multipv = integerAt(tokens, index + 1);
        index += 1;
        break;
      case "nodes":
        info.nodes = integerAt(tokens, index + 1);
        index += 1;
        break;
      case "nps":
        info.nps = integerAt(tokens, index + 1);
        index += 1;
        break;
      case "hashfull":
        info.hashfull = integerAt(tokens, index + 1);
        index += 1;
        break;
      case "wdl": {
        const wdl = wdlAt(tokens, index + 1);
        if (wdl) info.wdl = wdl;
        index += 3;
        break;
      }
      case "time":
        info.timeMs = integerAt(tokens, index + 1);
        index += 1;
        break;
      case "score": {
        const kind = tokens[index + 1];
        if (kind !== "cp" && kind !== "mate") break;
        const value = Number(tokens[index + 2]);
        if (Number.isFinite(value)) info.score = { kind, value: Math.trunc(value) };
        index += 2;
        break;
      }
      case "pv": {
        index += 1;
        while (index < tokens.length && !INFO_KEYWORDS.has(tokens[index]!)) {
          info.pv.push(tokens[index]!);
          index += 1;
        }
        index -= 1;
        break;
      }
      default:
        break;
    }
  }

  return info;
}

export function parseBestMove(line: string): UciBestMove | null {
  const tokens = tokenize(line);
  if (tokens[0] !== "bestmove") return null;
  const rawMove = tokens[1];
  const move =
    !rawMove || rawMove === "(none)" || rawMove === "0000"
      ? null
      : rawMove.toLowerCase();
  const ponder =
    tokens[2] === "ponder" && tokens[3] && tokens[3] !== "(none)"
      ? tokens[3].toLowerCase()
      : undefined;
  return { move, ponder, raw: line };
}

function formatPawns(centipawns: number): string {
  const pawns = centipawns / 100;
  return `${pawns > 0 ? "+" : ""}${pawns.toFixed(2)}`;
}

/** Converts a side-to-move UCI score into a White-perspective engine score. */
export function normalizeScore(
  score: UciScore,
  sideToMove: "w" | "b",
): EngineScore {
  if (score.kind === "cp") {
    const centipawns = sideToMove === "w" ? score.value : -score.value;
    return {
      kind: "cp",
      centipawns,
      label: formatPawns(centipawns),
    };
  }

  const mate = sideToMove === "w" ? score.value : -score.value;
  const label =
    mate === 0
      ? "Immediate mate"
      : mate > 0
        ? `White mates in ${mate}`
        : `Black mates in ${-mate}`;
  return { kind: "mate", mate, label };
}
