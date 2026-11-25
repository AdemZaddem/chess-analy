/**
 * Phase 4 contracts for full-game analysis.
 *
 * The original game and PGN are never mutated: every result below is derived
 * from the imported `NormalizedGame` and the settings used for one analysis run.
 */
import type {
  EngineIdentity,
  EngineScore,
  EngineSearchStats,
  EngineWdl,
} from "@/lib/engine/types";
import type { Color, NormalizedGame } from "@/lib/chess/types";

export type { Color } from "@/lib/chess/types";

export type AnalysisPreset = "quick" | "standard" | "deep" | "custom";

export interface ExpectedPointsConfig {
  /** Use UCI_ShowWDL counts when the engine emits them. */
  useEngineWdl: boolean;
  /** Logistic slope for the documented centipawn fallback. */
  centipawnSlope: number;
}

export interface ClassificationThresholds {
  /** Expected-points loss thresholds, in points from 0 to 1. */
  inaccuracy: number;
  mistake: number;
  blunder: number;
  /** Loss must stay below this for positive special labels. */
  specialMoveMaxLoss: number;
  /** A missed win starts from at least this expected-points value. */
  missedWinBefore: number;
  /** ...and must fall below this value. */
  missedWinAfter: number;
  missedWinMinLoss: number;
  /** Brilliant requires a material commitment and a favorable result. */
  sacrificeMaterialThreshold: number;
  brilliantAfter: number;
  brilliantMinGain: number;
  /** Great converts an unresolved position into a clear advantage. */
  greatBeforeMax: number;
  greatAfter: number;
  greatMinGain: number;
  /** Complexity heuristic used when only MultiPV 1 is available. */
  greatComplexLegalMoves: number;
  bestMaxLoss: number;
  excellentMaxLoss: number;
  /** Multiplier applied to loss thresholds when an evaluation is uncertain. */
  uncertainThresholdMultiplier: number;
}

export interface AnalysisSettings {
  preset: AnalysisPreset;
  depth: number;
  /** MultiPV is fixed at 1 for the initial Phase 4 UI. */
  multiPv: number;
  expectedPoints: ExpectedPointsConfig;
  classification: ClassificationThresholds;
  /** Book classification is deferred: no local move-by-move opening database exists. */
  bookClassification: false;
}

export type MoveClassification =
  | "brilliant"
  | "great"
  | "best"
  | "excellent"
  | "good"
  | "book"
  | "inaccuracy"
  | "mistake"
  | "blunder"
  | "missedWin";

export interface ClassificationCounts {
  brilliant: number;
  great: number;
  best: number;
  excellent: number;
  good: number;
  book: number;
  inaccuracy: number;
  mistake: number;
  blunder: number;
  missedWin: number;
}

export interface AnalysisIdentity {
  gameId: string;
  initialFen: string;
  playedMoves: string;
  preset: AnalysisPreset;
  depth: number;
  multiPv: number;
  /** Stable key combining game content and analysis settings. */
  key: string;
}

/** A reconstructed move with the tactical facts needed by classification. */
export interface PositionMove {
  ply: number;
  moveNumber: number;
  color: Color;
  san: string;
  uci: string;
  from: string;
  to: string;
  promotion?: string;
  piece: string;
  captured?: string;
  isCapture: boolean;
  isRecapture: boolean;
  isPromotion: boolean;
  givesCheck: boolean;
  /** Material gained by the mover, using pawn=1, minor=3, rook=5, queen=9. */
  materialDelta: number;
  /** Number of legal moves available before this move was played. */
  legalMoveCount: number;
  isForced: boolean;
}

export interface GamePosition {
  ply: number;
  fen: string;
  sideToMove: Color;
  move?: PositionMove;
  legalMoveCount: number;
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  isDraw: boolean;
  isTerminal: boolean;
}

/** Engine output normalized into white perspective plus expected-points data. */
export interface PositionEvaluation {
  fen: string;
  sideToMove: Color;
  /** White-perspective score; mate and centipawn values remain distinct. */
  score: EngineScore;
  /** White-perspective centipawns, null for mate scores. */
  centipawns: number | null;
  /** White-perspective mate distance in plies, null for centipawn scores. */
  mate: number | null;
  /** White-perspective numeric evaluation in pawns; null for mate scores. */
  whiteEvaluation: number | null;
  /** White's expected points from this position, always in [0, 1]. */
  expectedPointsWhite: number;
  /** True when engine WDL was used instead of the centipawn fallback. */
  usedEngineWdl: boolean;
  bestMove?: string;
  bestMoveSan?: string;
  principalVariation: string[];
  principalVariationSan: string[];
  depth: number;
  stats: EngineSearchStats;
  engine?: EngineIdentity;
  wdl?: EngineWdl;
  rawInfo?: string;
  legalMoveCount: number;
  isCheckmate: boolean;
  isStalemate: boolean;
  isTerminal: boolean;
  /** Missing/incomplete engine fields or a shallower than requested search. */
  uncertain: boolean;
}

export interface AnalyzedPosition extends GamePosition {
  evaluation: PositionEvaluation;
}

export interface ClassificationResult {
  classification: MoveClassification;
  reasons: string[];
  expectedPointsBefore: number;
  expectedPointsAfter: number;
  expectedPointsLoss: number;
  isBestMove: boolean;
  uncertain: boolean;
}

export interface MoveAnalysis {
  ply: number;
  moveNumber: number;
  color: Color;
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  positionBefore: PositionEvaluation;
  positionAfter: PositionEvaluation;
  /** Expected points for the player who made the move, before and after. */
  expectedPointsBefore: number;
  expectedPointsAfter: number;
  /** clamped max(0, expectedPointsBefore - expectedPointsAfter). */
  expectedPointsLoss: number;
  classification: MoveClassification;
  classificationReasons: string[];
  bestMove?: string;
  bestMoveSan?: string;
  isBestMove: boolean;
  principalVariation: string[];
  principalVariationSan: string[];
  principalVariationAfter: string[];
  principalVariationSanAfter: string[];
  depth: number;
  uncertain: boolean;
  isForced: boolean;
  isCapture: boolean;
  isRecapture: boolean;
  isPromotion: boolean;
  isSacrifice: boolean;
  materialDelta: number;
}

export interface PlayerAccuracy {
  color: Color;
  /** Percentage clamped to 0-100. */
  accuracy: number;
  movesCounted: number;
  forcedMovesSkipped: number;
  totalExpectedPointsLoss: number;
  averageExpectedPointsLoss: number;
}

export interface GameAccuracy {
  white: PlayerAccuracy;
  black: PlayerAccuracy;
}

export type FullGameRunStatus =
  | "idle"
  | "initializing"
  | "analyzing"
  | "stopping"
  | "complete"
  | "cancelled"
  | "error";

export interface FullGameProgress {
  identity: AnalysisIdentity;
  status: FullGameRunStatus;
  analyzedPositions: number;
  totalPositions: number;
  currentPly: number;
  currentFen: string;
  percent: number;
  startedAt: number;
  elapsedMs: number;
  /** Engine download percentage while the WASM assets load. */
  downloadPercent?: number;
  engineName?: string;
  message?: string;
}

export interface FullGameAnalysis {
  identity: AnalysisIdentity;
  settings: AnalysisSettings;
  /** Original PGN text, retained unchanged for traceability. */
  pgn: string;
  initialFen: string;
  positions: AnalyzedPosition[];
  moves: MoveAnalysis[];
  accuracy: GameAccuracy;
  counts: ClassificationCounts;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  /** True if any required position evaluation is missing or uncertain. */
  incomplete: boolean;
  warnings: string[];
  engine?: EngineIdentity;
}

export interface FullGameAnalysisRequest {
  game: NormalizedGame;
  settings: AnalysisSettings;
  signal?: AbortSignal;
  onProgress?: (progress: FullGameProgress) => void;
}
