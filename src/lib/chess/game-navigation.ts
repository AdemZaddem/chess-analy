import { Chess } from "chess.js";
import type { MoveRecord, NormalizedGame } from "./types";

export interface TimelinePosition {
  ply: number;
  fen: string;
  move?: MoveRecord;
}

export type PositionStatus =
  | "ongoing"
  | "check"
  | "checkmate"
  | "stalemate"
  | "draw";

/** Replays a game once to produce an indexable list of positions. */
export function buildTimeline(game: NormalizedGame): TimelinePosition[] {
  const chess = new Chess(game.initialFen);
  const timeline: TimelinePosition[] = [{ ply: 0, fen: chess.fen() }];

  for (const move of game.moves) {
    const played = chess.move({
      from: move.from,
      to: move.to,
      promotion: move.promotion,
    });
    timeline.push({ ply: move.ply, fen: played.after, move });
  }

  return timeline;
}

export function getPositionStatus(fen: string): PositionStatus {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) return "checkmate";
  if (chess.isStalemate()) return "stalemate";
  if (chess.isDraw()) return "draw";
  if (chess.isCheck()) return "check";
  return "ongoing";
}

export function clampPly(ply: number, moveCount: number): number {
  if (!Number.isFinite(ply)) return 0;
  return Math.min(Math.max(Math.trunc(ply), 0), moveCount);
}

export function firstPly(): number {
  return 0;
}

export function lastPly(moveCount: number): number {
  return Math.max(0, moveCount);
}

export function nextPly(currentPly: number, moveCount: number): number {
  return clampPly(currentPly + 1, moveCount);
}

export function previousPly(currentPly: number): number {
  return clampPly(currentPly - 1, Number.MAX_SAFE_INTEGER);
}
