import { Chess } from "chess.js";
import type {
  AnalysisSettings,
  GamePosition,
  MoveAnalysis,
  PositionEvaluation,
  PositionMove,
} from "@/lib/analysis/types";
import type { FullGameEngine } from "@/lib/analysis/full-game-service";
import type { NormalizedGame } from "@/lib/chess/types";
import { validateUciMove } from "@/lib/engine/chess-moves";
import type { EngineEvaluation, EngineWdl } from "@/lib/engine/types";
import { parsePgn } from "@/lib/chess/pgn-parser";

export function gameFromPgn(pgn: string, id?: string): NormalizedGame {
  const parsed = parsePgn(pgn);
  return {
    ...parsed,
    ...(id ? { id } : {}),
    source: { kind: "text" },
    gameCount: 1,
    gameIndex: 1,
    warnings: [],
  };
}

function firstUci(fen: string): string | undefined {
  const move = new Chess(fen).moves({ verbose: true })[0];
  return move ? `${move.from}${move.to}${move.promotion ?? ""}` : undefined;
}

export function makeEngineEvaluation(
  fen: string,
  options: {
    whiteCentipawns?: number;
    mate?: number;
    bestMove?: string | null;
    pv?: string[];
    depth?: number;
    wdl?: EngineWdl;
    rawInfo?: string;
  } = {},
): EngineEvaluation {
  const bestMove =
    options.bestMove === undefined ? firstUci(fen) : options.bestMove ?? undefined;
  const validated = bestMove ? validateUciMove(fen, bestMove) : null;
  const pv = options.pv ?? (validated ? [validated.uci] : []);
  const depth = options.depth ?? 12;
  const score =
    options.mate !== undefined
      ? {
          kind: "mate" as const,
          mate: options.mate,
          label:
            options.mate > 0
              ? `White mates in ${options.mate}`
              : `Black mates in ${-options.mate}`,
        }
      : {
          kind: "cp" as const,
          centipawns: options.whiteCentipawns ?? 0,
          label: `${(options.whiteCentipawns ?? 0) >= 0 ? "+" : ""}${(
            (options.whiteCentipawns ?? 0) / 100
          ).toFixed(2)}`,
        };

  return {
    fen,
    depth,
    score: score.kind === "cp" ? (score.centipawns ?? 0) / 100 : null,
    ...(score.kind === "mate" ? { mate: score.mate } : {}),
    ...(validated
      ? { bestMove: validated.uci, bestMoveSan: validated.san }
      : {}),
    ...(options.wdl ? { wdl: options.wdl } : {}),
    principalVariation: pv,
    principalVariationSan: validated ? [validated.san] : [],
    engine: { name: "Mock Stockfish", version: "19" },
    evaluation: score,
    stats: { depth, nodes: 1_000, nps: 50_000, hashfull: 1, timeMs: 20 },
    ...(options.rawInfo ? { rawInfo: options.rawInfo } : {}),
  };
}

export interface ScriptedCall {
  fen: string;
  depth: number;
  multiPv: number;
}

export interface ScriptedEngineState {
  calls: ScriptedCall[];
  activeCalls: number;
  maxActiveCalls: number;
  initializeCalls: number;
  stopCalls: number;
}

export function createScriptedEngine(
  evaluator: (fen: string, callIndex: number, settings: AnalysisSettings) => EngineEvaluation,
  options: {
    delayMs?: number;
    failOnCall?: number;
    identity?: { name: string; version?: string };
  } = {},
): { engine: FullGameEngine; state: ScriptedEngineState } {
  const state: ScriptedEngineState = {
    calls: [],
    activeCalls: 0,
    maxActiveCalls: 0,
    initializeCalls: 0,
    stopCalls: 0,
  };

  const engine: FullGameEngine = {
    async initialize() {
      state.initializeCalls += 1;
    },
    isReady() {
      return true;
    },
    subscribe() {
      return () => undefined;
    },
    getIdentity() {
      return options.identity ?? { name: "Mock Stockfish" };
    },
    async analyzePosition(fen, searchOptions = {}) {
      const callIndex = state.calls.length;
      state.calls.push({
        fen,
        depth: searchOptions.depth ?? 15,
        multiPv: searchOptions.multiPv ?? 1,
      });
      state.activeCalls += 1;
      state.maxActiveCalls = Math.max(state.maxActiveCalls, state.activeCalls);
      try {
        if (options.delayMs) {
          await new Promise<void>((resolve) => setTimeout(resolve, options.delayMs));
        }
        if (searchOptions.signal?.aborted) {
          throw new DOMException("Analysis stopped", "AbortError");
        }
        if (options.failOnCall === callIndex) {
          throw new Error("mock engine failure");
        }
        // The runner supplies settings by closure in tests; use a stable default.
        return evaluator(fen, callIndex, {
          preset: "standard",
          depth: searchOptions.depth ?? 15,
          multiPv: searchOptions.multiPv ?? 1,
          expectedPoints: {
            useEngineWdl: true,
            centipawnSlope: 0.00368208,
          },
          classification: {
            inaccuracy: 0.07,
            mistake: 0.16,
            blunder: 0.32,
            specialMoveMaxLoss: 0.08,
            sacrificeMaterialThreshold: 2,
            missedWinBefore: 0.9,
            missedWinAfter: 0.6,
            missedWinMinLoss: 0.28,
            brilliantAfter: 0.6,
            brilliantMinGain: 0.08,
            greatBeforeMax: 0.85,
            greatAfter: 0.75,
            greatMinGain: 0.1,
            greatComplexLegalMoves: 25,
            bestMaxLoss: 0.02,
            excellentMaxLoss: 0.05,
            uncertainThresholdMultiplier: 1.5,
          },
          bookClassification: false,
        });
      } finally {
        state.activeCalls -= 1;
      }
    },
    async stop() {
      state.stopCalls += 1;
    },
    terminate() {
      // Shared engine lifecycle is owned by React in production; mock is inert.
    },
  };

  return { engine, state };
}

export function fakePositionEvaluation(
  expectedPointsWhite: number,
  overrides: Partial<PositionEvaluation> = {},
): PositionEvaluation {
  const centipawns = expectedPointsWhite * 100;
  return {
    fen: "8/8/8/8/8/8/8/K6k w - - 0 1",
    sideToMove: "w",
    score: { kind: "cp", centipawns, label: `${(centipawns / 100).toFixed(2)}` },
    centipawns,
    mate: null,
    whiteEvaluation: centipawns / 100,
    expectedPointsWhite,
    usedEngineWdl: false,
    bestMove: "a1a2",
    bestMoveSan: "Ka2",
    principalVariation: ["a1a2"],
    principalVariationSan: ["Ka2"],
    depth: 12,
    stats: { depth: 12, nodes: 1_000 },
    legalMoveCount: 10,
    isCheckmate: false,
    isStalemate: false,
    isTerminal: false,
    uncertain: false,
    ...overrides,
  };
}

export function fakeGamePosition(
  move: Partial<PositionMove> = {},
  overrides: Partial<GamePosition> = {},
): GamePosition {
  const fullMove: PositionMove = {
    ply: 1,
    moveNumber: 1,
    color: "w",
    san: "e4",
    uci: "e2e4",
    from: "e2",
    to: "e4",
    piece: "p",
    isCapture: false,
    isRecapture: false,
    isPromotion: false,
    givesCheck: false,
    materialDelta: 0,
    legalMoveCount: 20,
    isForced: false,
    ...move,
  };
  return {
    ply: fullMove.ply,
    fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
    sideToMove: fullMove.color,
    move: fullMove,
    legalMoveCount: fullMove.legalMoveCount,
    isCheck: false,
    isCheckmate: false,
    isStalemate: false,
    isDraw: false,
    isTerminal: false,
    ...overrides,
  };
}

export function fakeMoveAnalysis(
  options: {
    color?: "w" | "b";
    before?: number;
    after?: number;
    forced?: boolean;
    classification?: MoveAnalysis["classification"];
  } = {},
): MoveAnalysis {
  const color = options.color ?? "w";
  const beforeWhite = options.before ?? 0.8;
  const afterWhite = options.after ?? 0.6;
  const expectedPointsBefore = color === "w" ? beforeWhite : 1 - beforeWhite;
  const expectedPointsAfter = color === "w" ? afterWhite : 1 - afterWhite;
  const before = fakePositionEvaluation(beforeWhite);
  const after = fakePositionEvaluation(afterWhite);
  const loss = Math.min(1, Math.max(0, expectedPointsBefore - expectedPointsAfter));

  return {
    ply: 1,
    moveNumber: 1,
    color,
    san: "e4",
    uci: "e2e4",
    fenBefore: before.fen,
    fenAfter: after.fen,
    positionBefore: before,
    positionAfter: after,
    expectedPointsBefore,
    expectedPointsAfter,
    expectedPointsLoss: loss,
    classification: options.classification ?? "good",
    classificationReasons: [],
    bestMove: "e2e4",
    bestMoveSan: "e4",
    isBestMove: true,
    principalVariation: ["e2e4"],
    principalVariationSan: ["e4"],
    principalVariationAfter: [],
    principalVariationSanAfter: [],
    depth: 12,
    uncertain: false,
    isForced: options.forced ?? false,
    isCapture: false,
    isRecapture: false,
    isPromotion: false,
    isSacrifice: false,
    materialDelta: 0,
  };
}
