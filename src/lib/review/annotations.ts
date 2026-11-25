/**
 * Board annotations are derived from the position actually displayed. Every
 * arrow is validated against that FEN, so reviewing a past move never draws a
 * best-move arrow through pieces that are no longer there.
 */
import { validateUciMove } from "@/lib/engine/chess-moves";

export interface BoardArrow {
  startSquare: string;
  endSquare: string;
  color: string;
}

export interface BoardSquareStyle {
  backgroundColor: string;
}

export interface BoardAnnotations {
  arrows: BoardArrow[];
  squareStyles: Record<string, BoardSquareStyle>;
}

const SQUARE_PATTERN = /^[a-h][1-8]$/;

/** Shared with the board legend so the swatches cannot drift from the arrows. */
export const BOARD_ANNOTATION_COLORS = {
  played: "rgba(250, 204, 21, 0.85)",
  engine: "rgba(167, 139, 250, 0.9)",
  variation: "rgba(56, 189, 248, 0.9)",
} as const;

function squaresOf(uci: string): { from: string; to: string } | null {
  const match = /^([a-h][1-8])([a-h][1-8])/.exec(uci);
  return match ? { from: match[1]!, to: match[2]! } : null;
}

export function buildBoardAnnotations({
  fen,
  playedMove,
  engineUci,
  variationMove,
}: {
  fen: string;
  playedMove?: { from: string; to: string } | null;
  engineUci?: string | null;
  variationMove?: { from: string; to: string } | null;
}): BoardAnnotations {
  const arrows: BoardArrow[] = [];
  const squareStyles: Record<string, BoardSquareStyle> = {};

  // While exploring a variation its move takes priority: at most two arrows
  // are ever drawn, so the board stays readable.
  if (variationMove && SQUARE_PATTERN.test(variationMove.from) && SQUARE_PATTERN.test(variationMove.to)) {
    arrows.push({
      startSquare: variationMove.from,
      endSquare: variationMove.to,
      color: BOARD_ANNOTATION_COLORS.variation,
    });
    squareStyles[variationMove.from] = { backgroundColor: "rgba(56, 189, 248, 0.30)" };
    squareStyles[variationMove.to] = { backgroundColor: "rgba(56, 189, 248, 0.45)" };
    return { arrows, squareStyles };
  }

  if (playedMove && SQUARE_PATTERN.test(playedMove.from) && SQUARE_PATTERN.test(playedMove.to)) {
    arrows.push({
      startSquare: playedMove.from,
      endSquare: playedMove.to,
      color: BOARD_ANNOTATION_COLORS.played,
    });
    squareStyles[playedMove.from] = { backgroundColor: "rgba(250, 204, 21, 0.34)" };
    squareStyles[playedMove.to] = { backgroundColor: "rgba(250, 204, 21, 0.48)" };
  }

  if (engineUci) {
    const legal = validateUciMove(fen, engineUci);
    if (legal) {
      const squares = squaresOf(legal.uci)!;
      arrows.push({
        startSquare: squares.from,
        endSquare: squares.to,
        color: BOARD_ANNOTATION_COLORS.engine,
      });
      squareStyles[squares.from] = { backgroundColor: "rgba(167, 139, 250, 0.30)" };
      squareStyles[squares.to] = { backgroundColor: "rgba(167, 139, 250, 0.44)" };
    }
  }

  return { arrows, squareStyles };
}
