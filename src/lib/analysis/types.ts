/**
 * Result types reserved for the move-classification phases.
 * Phase 1 intentionally produces no analysis results.
 */
export type MoveClassification =
  | "brilliant"
  | "great"
  | "best"
  | "excellent"
  | "good"
  | "inaccuracy"
  | "mistake"
  | "blunder";

export interface MoveAnalysis {
  ply: number;
  san: string;
  evaluationBefore: number | null;
  evaluationAfter: number | null;
  bestMove?: string;
  classification?: MoveClassification;
  alternatives?: string[];
}

export interface GameAnalysis {
  gameId: string;
  moves: MoveAnalysis[];
  accuracy?: {
    white: number;
    black: number;
  };
}
