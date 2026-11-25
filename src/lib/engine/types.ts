/**
 * Engine contracts. The Phase 1 fields remain present so existing consumers
 * keep working; Phase 3 adds typed identity, evaluation and search details.
 */
export type EngineScoreKind = "cp" | "mate";

export interface EngineScore {
  kind: EngineScoreKind;
  /** White-perspective centipawns. Present only for `cp` scores. */
  centipawns?: number;
  /** White-perspective mate distance in plies. Present only for `mate` scores. */
  mate?: number;
  /** Short display label, e.g. "+0.29" or "White mates in 3". */
  label: string;
}

export interface EngineIdentity {
  name: string;
  author?: string;
  version?: string;
}

/** UCI_ShowWDL counts from the side to move's perspective, in per-mille. */
export interface EngineWdl {
  win: number;
  draw: number;
  loss: number;
}

export interface EngineSearchStats {
  depth: number;
  selectiveDepth?: number;
  multiPv?: number;
  nodes?: number;
  nps?: number;
  hashfull?: number;
  timeMs?: number;
}

export interface EngineEvaluation {
  fen: string;
  depth: number;
  /** Pawns from White's perspective; null when a mate is found. */
  score: number | null;
  /** Mate distance in plies from White's perspective. */
  mate?: number;
  bestMove?: string;
  bestMoveSan?: string;
  /** Present when UCI_ShowWDL is enabled and the engine emitted counts. */
  wdl?: EngineWdl;
  principalVariation?: string[];
  principalVariationSan?: string[];
  engine?: EngineIdentity;
  evaluation: EngineScore;
  stats: EngineSearchStats;
  /** Raw UCI info line that produced this evaluation, for diagnostics. */
  rawInfo?: string;
}

export interface EngineAnalysisOptions {
  depth?: number;
  moveTimeMs?: number;
  multiPv?: number;
  signal?: AbortSignal;
}

export interface EngineDownloadProgress {
  percent: number;
  loaded: number;
  total: number;
  speedText?: string;
  etaText?: string;
}

export interface EngineSearchProgress {
  fen: string;
  depth: number;
  evaluation?: EngineScore;
  principalVariation?: string[];
  stats: EngineSearchStats;
}

export type EngineStatusEvent =
  | { type: "downloading"; progress: EngineDownloadProgress }
  | { type: "initializing" }
  | { type: "ready"; engine: EngineIdentity }
  | { type: "searching"; progress: EngineSearchProgress }
  | { type: "stopped" }
  | { type: "error"; message: string };

export interface EngineService {
  initialize?(): Promise<void>;
  isReady?(): boolean;
  analyzePosition(
    fen: string,
    options?: EngineAnalysisOptions,
  ): Promise<EngineEvaluation>;
  stop?(): Promise<void>;
  terminate?(): void;
}
