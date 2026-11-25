import { Chess, type PieceSymbol, type Square } from "chess.js";
import type { NormalizedGame } from "@/lib/chess/types";
import { sideToMove } from "@/lib/engine/chess-moves";
import { FullGameAnalysisError } from "./errors";
import type { GamePosition, PositionMove } from "./types";

const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

function pieceValue(piece: PieceSymbol | undefined): number {
  return piece ? PIECE_VALUES[piece] : 0;
}

function normalizeUci(from: string, to: string, promotion?: string): string {
  return `${from}${to}${promotion ? promotion.toLowerCase() : ""}`;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown replay error";
}

/**
 * Replays the imported game from its real `initialFen` once. Standard FEN,
 * custom starting FEN, promotion, castling and en passant all flow through
 * chess.js, so no separate move generator is needed.
 */
export function buildGamePositions(game: NormalizedGame): GamePosition[] {
  let chess: Chess;
  try {
    chess = new Chess(game.initialFen);
  } catch (error) {
    throw new FullGameAnalysisError(
      "invalid-game",
      `Cannot replay the initial position: ${describeError(error)}`,
      { cause: error },
    );
  }

  function snapshot(ply: number, move?: PositionMove): GamePosition {
    const isCheck = chess.isCheck();
    const isCheckmate = chess.isCheckmate();
    const isStalemate = chess.isStalemate();
    const isDraw = chess.isDraw();
    return {
      ply,
      fen: chess.fen(),
      sideToMove: sideToMove(chess.fen()),
      ...(move ? { move } : {}),
      legalMoveCount: chess.moves().length,
      isCheck,
      isCheckmate,
      isStalemate,
      isDraw,
      isTerminal: isCheckmate || isStalemate || isDraw,
    };
  }

  const positions: GamePosition[] = [snapshot(0)];
  let previousTo: string | null = null;
  let previousWasCapture = false;

  game.moves.forEach((record, index) => {
    const fenBefore = chess.fen();
    const expectedTurn = sideToMove(fenBefore);
    if (record.color !== expectedTurn) {
      throw new FullGameAnalysisError(
        "invalid-game",
        `Move ${index + 1} is recorded as ${record.color} but ${expectedTurn} is to move.`,
      );
    }

    const uci = normalizeUci(record.from, record.to, record.promotion);
    const destination = chess.get(record.to as Square);
    const legalMoveCount = chess.moves().length;
    let played;
    try {
      played = chess.move({
        from: record.from as Square,
        to: record.to as Square,
        ...(record.promotion
          ? { promotion: record.promotion.toLowerCase() as PieceSymbol }
          : {}),
      });
    } catch (error) {
      throw new FullGameAnalysisError(
        "invalid-game",
        `Move ${index + 1} (${record.san}) is illegal in the replayed position: ${describeError(error)}`,
        { cause: error },
      );
    }
    if (!played) {
      throw new FullGameAnalysisError(
        "invalid-game",
        `Move ${index + 1} (${record.san}) is illegal in the replayed position.`,
      );
    }

    const fenAfter = chess.fen();
    if (record.fen && record.fen !== fenAfter) {
      throw new FullGameAnalysisError(
        "invalid-game",
        `Move ${index + 1} (${record.san}) has a stored FEN that does not match the replay.`,
      );
    }

    const captured = played.captured as PieceSymbol | undefined;
    const isCapture = Boolean(captured) || played.flags.includes("e") || Boolean(destination);
    const isRecapture = previousWasCapture && previousTo === record.to;
    const promotion = record.promotion?.toLowerCase();
    const materialDelta =
      pieceValue(captured) +
      (promotion ? pieceValue(promotion as PieceSymbol) - pieceValue("p") : 0);

    const move: PositionMove = {
      ply: record.ply || index + 1,
      moveNumber: record.moveNumber || index + 1,
      color: record.color,
      san: played.san,
      uci,
      from: record.from,
      to: record.to,
      ...(promotion ? { promotion } : {}),
      piece: played.piece,
      ...(captured ? { captured } : {}),
      isCapture,
      isRecapture,
      isPromotion: Boolean(promotion),
      givesCheck: chess.isCheck(),
      materialDelta,
      legalMoveCount,
      isForced: legalMoveCount === 1,
    };

    positions.push(snapshot(move.ply, move));
    previousTo = record.to;
    previousWasCapture = isCapture;
  });

  return positions;
}
