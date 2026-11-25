/**
 * Phase 5 variation viewer helpers. Engine UCI lines are validated move by
 * move from the position being reviewed; an illegal token ends the line.
 */
import { validateUciMove, validateVariation } from "@/lib/engine/chess-moves";

export interface VariationMove {
  /** 1-based index inside the validated variation. */
  index: number;
  uci: string;
  san: string;
  from: string;
  to: string;
  promotion?: string;
  fenBefore: string;
  fenAfter: string;
}

export interface VariationLine {
  baseFen: string;
  moves: VariationMove[];
  /** 1-based index of the first rejected UCI token, or null if all were legal. */
  rejectedAt: number | null;
  complete: boolean;
}

function emptyLine(baseFen: string, inputLength: number): VariationLine {
  return {
    baseFen,
    moves: [],
    rejectedAt: inputLength > 0 ? 1 : null,
    complete: inputLength === 0,
  };
}

/**
 * Validates a PV with chess.js and returns navigable FEN/SAN steps. Castling,
 * promotion and en passant are handled by `validateUciMove`; no second move
 * generator is introduced.
 */
export function buildVariation(baseFen: string, uciMoves: string[]): VariationLine {
  const input = Array.isArray(uciMoves) ? uciMoves.filter((move) => typeof move === "string") : [];
  let validUci: string[];
  try {
    validUci = validateVariation(baseFen, input).uci;
  } catch {
    return emptyLine(baseFen, input.length);
  }

  const moves: VariationMove[] = [];
  let fen = baseFen;
  for (const entry of validUci) {
    const validated = validateUciMove(fen, entry);
    if (!validated) break;
    const promotion = /^[a-h][1-8][a-h][1-8]([qrbn])$/i.exec(validated.uci)?.[1];
    moves.push({
      index: moves.length + 1,
      uci: validated.uci,
      san: validated.san,
      from: validated.uci.slice(0, 2),
      to: validated.uci.slice(2, 4),
      ...(promotion ? { promotion: promotion.toLowerCase() } : {}),
      fenBefore: fen,
      fenAfter: validated.fenAfter,
    });
    fen = validated.fenAfter;
  }

  const rejectedAt = moves.length < input.length ? moves.length + 1 : null;
  return {
    baseFen,
    moves,
    rejectedAt,
    complete: rejectedAt === null,
  };
}

/** Groups a variation into numbered pairs for readable SAN display. */
export function formatVariationSan(
  moves: VariationMove[],
  baseFen: string,
): string {
  if (!moves.length) return "—";
  const fullmove = Number.parseInt(baseFen.split(/\s+/)[5] ?? "1", 10);
  const firstMoveNumber = Number.isFinite(fullmove) ? fullmove : 1;
  const firstColor = baseFen.split(/\s+/)[1] === "b" ? "b" : "w";
  const tokens: string[] = [];

  moves.forEach((move, index) => {
    const isWhite = firstColor === "w" ? index % 2 === 0 : index % 2 === 1;
    const moveNumber =
      firstMoveNumber + Math.floor((index + (firstColor === "b" ? 1 : 0)) / 2);
    if (isWhite) {
      tokens.push(`${moveNumber}.`);
    } else if (index === 0) {
      // A line that starts from a Black-to-move position must say whose move it is.
      tokens.push(`${moveNumber}...`);
    }
    tokens.push(move.san);
  });

  return tokens.join(" ");
}
