import { calculateGameAccuracy } from "./accuracy";
import { classifyMove, isSacrificingMove } from "./classification";
import {
  FullGameAnalysisError,
  isCancellationError,
} from "./errors";
import {
  expectedPointsForPlayer,
  expectedPointsLoss,
  whiteExpectedPoints,
} from "./expected-points";
import { buildGamePositions } from "./positions";
import { createAnalysisIdentity } from "./settings";
import type {
  AnalyzedPosition,
  ClassificationCounts,
  FullGameAnalysis,
  FullGameAnalysisRequest,
  FullGameRunStatus,
  MoveAnalysis,
  PositionEvaluation,
} from "./types";
import type {
  EngineEvaluation,
  EngineIdentity,
  EngineService,
  EngineStatusEvent,
} from "@/lib/engine/types";

export interface FullGameEngine extends EngineService {
  subscribe?(listener: (event: EngineStatusEvent) => void): () => void;
  getIdentity?(): EngineIdentity;
}

function createEmptyCounts(): ClassificationCounts {
  return {
    brilliant: 0,
    great: 0,
    best: 0,
    excellent: 0,
    good: 0,
    book: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
    missedWin: 0,
  };
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return Boolean(signal?.aborted);
}

function cancellation(): FullGameAnalysisError {
  return new FullGameAnalysisError("cancelled", "Full-game analysis was cancelled.");
}

function toPositionEvaluation(
  engineEvaluation: EngineEvaluation,
  position: ReturnType<typeof buildGamePositions>[number],
  request: FullGameAnalysisRequest,
): PositionEvaluation {
  const score = engineEvaluation.evaluation;
  const usedEngineWdl =
    request.settings.expectedPoints.useEngineWdl && Boolean(engineEvaluation.wdl);
  const depth = engineEvaluation.depth ?? request.settings.depth;
  const hasUsableScore =
    (score.kind === "cp" && Number.isFinite(score.centipawns ?? NaN)) ||
    (score.kind === "mate" && Number.isFinite(score.mate ?? NaN));
  const uncertain =
    depth < request.settings.depth ||
    !hasUsableScore ||
    (!position.isTerminal && !engineEvaluation.bestMove);

  return {
    fen: position.fen,
    sideToMove: position.sideToMove,
    score,
    centipawns: score.kind === "cp" ? (score.centipawns ?? null) : null,
    mate: score.kind === "mate" ? (score.mate ?? null) : null,
    whiteEvaluation:
      score.kind === "cp" && score.centipawns !== undefined
        ? score.centipawns / 100
        : null,
    expectedPointsWhite: whiteExpectedPoints(
      engineEvaluation,
      request.settings.expectedPoints,
    ),
    usedEngineWdl,
    ...(engineEvaluation.bestMove
      ? {
          bestMove: engineEvaluation.bestMove,
          bestMoveSan: engineEvaluation.bestMoveSan,
        }
      : {}),
    principalVariation: engineEvaluation.principalVariation ?? [],
    principalVariationSan: engineEvaluation.principalVariationSan ?? [],
    depth,
    stats: engineEvaluation.stats,
    ...(engineEvaluation.engine ? { engine: engineEvaluation.engine } : {}),
    ...(engineEvaluation.wdl ? { wdl: engineEvaluation.wdl } : {}),
    ...(engineEvaluation.rawInfo ? { rawInfo: engineEvaluation.rawInfo } : {}),
    legalMoveCount: position.legalMoveCount,
    isCheckmate: position.isCheckmate,
    isStalemate: position.isStalemate,
    isTerminal: position.isTerminal,
    uncertain,
  };
}

function buildMoveAnalyses(
  positions: AnalyzedPosition[],
  request: FullGameAnalysisRequest,
): MoveAnalysis[] {
  const moves: MoveAnalysis[] = [];

  for (let index = 1; index < positions.length; index += 1) {
    const beforePosition = positions[index - 1]!;
    const afterPosition = positions[index]!;
    const move = afterPosition.move;
    if (!move) continue;

    const result = classifyMove({
      settings: request.settings,
      positionBefore: beforePosition,
      positionAfter: afterPosition,
      evaluationBefore: beforePosition.evaluation,
      evaluationAfter: afterPosition.evaluation,
    });
    const beforeEvaluation = beforePosition.evaluation;
    const afterEvaluation = afterPosition.evaluation;

    moves.push({
      ply: move.ply,
      moveNumber: move.moveNumber,
      color: move.color,
      san: move.san,
      uci: move.uci,
      fenBefore: beforePosition.fen,
      fenAfter: afterPosition.fen,
      positionBefore: beforeEvaluation,
      positionAfter: afterEvaluation,
      expectedPointsBefore: result.expectedPointsBefore,
      expectedPointsAfter: result.expectedPointsAfter,
      expectedPointsLoss: result.expectedPointsLoss,
      classification: result.classification,
      classificationReasons: result.reasons,
      ...(beforeEvaluation.bestMove
        ? { bestMove: beforeEvaluation.bestMove }
        : {}),
      ...(beforeEvaluation.bestMoveSan
        ? { bestMoveSan: beforeEvaluation.bestMoveSan }
        : {}),
      isBestMove: result.isBestMove,
      principalVariation: beforeEvaluation.principalVariation,
      principalVariationSan: beforeEvaluation.principalVariationSan,
      principalVariationAfter: afterEvaluation.principalVariation,
      principalVariationSanAfter: afterEvaluation.principalVariationSan,
      depth: Math.min(beforeEvaluation.depth, afterEvaluation.depth),
      uncertain: result.uncertain,
      isForced: move.isForced,
      isCapture: move.isCapture,
      isRecapture: move.isRecapture,
      isPromotion: move.isPromotion,
      isSacrifice: isSacrificingMove(move, request.settings),
      materialDelta: move.materialDelta,
    });
  }

  return moves;
}

/**
 * Runs one full-game analysis against a single engine service. Searches are
 * awaited one at a time; a per-run guard prevents overlapping full analyses.
 */
export class FullGameAnalysisRunner {
  private activeRun: symbol | null = null;

  constructor(private readonly engine: FullGameEngine) {}

  async analyze(request: FullGameAnalysisRequest): Promise<FullGameAnalysis> {
    if (this.activeRun) {
      throw new FullGameAnalysisError(
        "already-running",
        "A full-game analysis is already running. Cancel it before starting another.",
      );
    }

    const runToken = Symbol("full-game-analysis");
    this.activeRun = runToken;
    const identity = createAnalysisIdentity(request.game, request.settings);
    const startedAt = Date.now();
    let status: FullGameRunStatus = "initializing";
    let analyzedPositions = 0;
    let downloadPercent: number | undefined;
    let engineName: string | undefined;
    let positions: ReturnType<typeof buildGamePositions> | null = null;
    let totalPositions = 0;

    const emit = (message?: string): void => {
      request.onProgress?.({
        identity,
        status,
        analyzedPositions,
        totalPositions,
        currentPly: positions?.[Math.min(analyzedPositions, Math.max(0, positions.length - 1))]?.ply ?? 0,
        currentFen: positions?.[Math.min(analyzedPositions, Math.max(0, positions.length - 1))]?.fen ?? "",
        percent: totalPositions ? analyzedPositions / totalPositions : 1,
        startedAt,
        elapsedMs: Date.now() - startedAt,
        ...(downloadPercent !== undefined ? { downloadPercent } : {}),
        ...(engineName !== undefined ? { engineName } : {}),
        ...(message ? { message } : {}),
      });
    };

    const unsubscribe = this.engine.subscribe?.((event) => {
      switch (event.type) {
        case "downloading":
          downloadPercent = event.progress.percent;
          emit("Loading local engine…");
          break;
        case "initializing":
          emit("Preparing Stockfish…");
          break;
        case "ready":
          engineName = event.engine.name;
          downloadPercent = undefined;
          break;
        case "error":
          // The active analyzePosition call rejects with the typed engine error.
          break;
        default:
          break;
      }
    });

    emit("Preparing Stockfish…");

    try {
      positions = buildGamePositions(request.game);
      totalPositions = positions.length;
      const runPositions = positions;
      if (isAborted(request.signal)) throw cancellation();
      await this.engine.initialize?.();
      engineName ??= this.engine.getIdentity?.().name;
      if (isAborted(request.signal)) throw cancellation();

      status = "analyzing";
      const cache = new Map<string, EngineEvaluation>();
      const evaluated: AnalyzedPosition[] = [];

      for (const position of runPositions) {
        if (isAborted(request.signal)) throw cancellation();
        emit(position.move ? `Analyzing ${position.move.san}` : "Analyzing initial position");

        let engineEvaluation = cache.get(position.fen);
        if (!engineEvaluation) {
          try {
            engineEvaluation = await this.engine.analyzePosition(position.fen, {
              depth: request.settings.depth,
              multiPv: request.settings.multiPv,
              signal: request.signal,
            });
          } catch (error) {
            if (isAborted(request.signal) || isCancellationError(error)) {
              throw cancellation();
            }
            throw new FullGameAnalysisError(
              "engine-failed",
              error instanceof Error
                ? `Stockfish failed during full-game analysis: ${error.message}`
                : "Stockfish failed during full-game analysis.",
              { cause: error },
            );
          }
          if (engineEvaluation.fen.trim() !== position.fen.trim()) {
            throw new FullGameAnalysisError(
              "stale-analysis",
              "The engine returned an evaluation for a different position.",
            );
          }
          cache.set(position.fen, engineEvaluation);
        }

        evaluated.push({
          ...position,
          evaluation: toPositionEvaluation(engineEvaluation, position, request),
        });
        analyzedPositions += 1;
      }

      if (isAborted(request.signal)) throw cancellation();

      const moves = buildMoveAnalyses(evaluated, request);
      const counts = createEmptyCounts();
      for (const move of moves) counts[move.classification] += 1;

      const uncertainPositions = evaluated.filter((position) => position.evaluation.uncertain).length;
      const warnings: string[] = [];
      if (uncertainPositions > 0) {
        warnings.push(
          `${uncertainPositions} position${uncertainPositions === 1 ? "" : "s"} returned incomplete or shallower-than-requested engine data; special labels were withheld there.`,
        );
      }
      if (request.settings.bookClassification) {
        warnings.push("Book classification is deferred until a local move-by-move opening database is available.");
      }

      const completedAt = Date.now();
      status = "complete";
      emit("Analysis complete");

      return {
        identity,
        settings: { ...request.settings },
        pgn: request.game.pgn,
        initialFen: request.game.initialFen,
        positions: evaluated,
        moves,
        accuracy: calculateGameAccuracy(moves),
        counts,
        startedAt,
        completedAt,
        durationMs: completedAt - startedAt,
        incomplete: uncertainPositions > 0,
        warnings,
        ...(engineName ? { engine: { name: engineName } } : {}),
      };
    } catch (error) {
      status = isCancellationError(error) || isAborted(request.signal) ? "cancelled" : "error";
      emit(error instanceof Error ? error.message : "Full-game analysis failed.");
      if (isCancellationError(error) || isAborted(request.signal)) {
        await this.engine.stop?.().catch(() => undefined);
        throw cancellation();
      }
      throw error;
    } finally {
      unsubscribe?.();
      if (this.activeRun === runToken) this.activeRun = null;
    }
  }

  isRunning(): boolean {
    return this.activeRun !== null;
  }
}

export function countAnalyzedPositions(
  result: FullGameAnalysis | null | undefined,
): number {
  return result?.positions.length ?? 0;
}

export function playerExpectedLoss(
  result: FullGameAnalysis,
  color: "w" | "b",
): number {
  return result.moves
    .filter((move) => move.color === color)
    .reduce((sum, move) => sum + expectedPointsLoss(
      expectedPointsForPlayer(move.expectedPointsBefore, color),
      expectedPointsForPlayer(move.expectedPointsAfter, color),
    ), 0);
}
