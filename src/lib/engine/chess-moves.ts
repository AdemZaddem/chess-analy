import {
  Chess,
  validateFen,
  type PieceSymbol,
  type Square,
} from "chess.js";
import { EngineError } from "./errors";

const UCI_MOVE_PATTERN = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/i;
const PROMOTIONS = new Set(["q", "r", "b", "n"]);

export interface ValidatedUciMove {
  uci: string;
  san: string;
  fenAfter: string;
}

export interface ValidatedVariation {
  uci: string[];
  san: string[];
}

export function sideToMove(fen: string): "w" | "b" {
  return fen.trim().split(/\s+/)[1] === "b" ? "b" : "w";
}

export function assertValidFen(fen: string): void {
  const result = validateFen(fen);
  if (!result.ok) {
    throw new EngineError("invalid-fen", `Invalid FEN: ${result.error}`);
  }
}

/** Validates a UCI move with chess.js, including castling, en passant and promotion. */
export function validateUciMove(
  fen: string,
  uciMove: string,
): ValidatedUciMove | null {
  const match = UCI_MOVE_PATTERN.exec(uciMove.trim().toLowerCase());
  if (!match) return null;

  const [, from, to, promotion] = match;
  if (promotion && !PROMOTIONS.has(promotion)) return null;

  const chess = new Chess(fen);
  try {
    const move = chess.move({
      from: from as Square,
      to: to as Square,
      ...(promotion ? { promotion: promotion as PieceSymbol } : {}),
    });
    if (!move) return null;
    return {
      uci: `${from}${to}${promotion ?? ""}`,
      san: move.san,
      fenAfter: chess.fen(),
    };
  } catch {
    return null;
  }
}

/** Keeps the legal prefix of a principal variation and derives SAN move by move. */
export function validateVariation(
  fen: string,
  uciMoves: string[],
): ValidatedVariation {
  const chess = new Chess(fen);
  const validUci: string[] = [];
  const san: string[] = [];

  for (const uciMove of uciMoves) {
    const match = UCI_MOVE_PATTERN.exec(uciMove.trim().toLowerCase());
    if (!match) break;
    const [, from, to, promotion] = match;
    if (promotion && !PROMOTIONS.has(promotion)) break;
    try {
      const move = chess.move({
        from: from as Square,
        to: to as Square,
        ...(promotion ? { promotion: promotion as PieceSymbol } : {}),
      });
      if (!move) break;
      validUci.push(`${from}${to}${promotion ?? ""}`);
      san.push(move.san);
    } catch {
      break;
    }
  }

  return { uci: validUci, san };
}
