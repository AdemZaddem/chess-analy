/**
 * Integration point reserved for the Stockfish phase.
 * No engine implementation exists in Phase 1.
 */
export interface EngineEvaluation {
  fen: string;
  depth: number;
  /** Score in pawns from White's perspective; null when a mate is found. */
  score: number | null;
  /** Mate distance in plies from White's perspective. */
  mate?: number;
  bestMove?: string;
  principalVariation?: string[];
}

export interface EngineAnalysisOptions {
  depth?: number;
  multiPv?: number;
  signal?: AbortSignal;
}

export interface EngineService {
  analyzePosition(
    fen: string,
    options?: EngineAnalysisOptions,
  ): Promise<EngineEvaluation>;
  terminate?(): void;
}
