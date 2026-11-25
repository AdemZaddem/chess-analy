import type { NormalizedGame } from "@/lib/chess/types";
import type {
  AnalysisIdentity,
  AnalysisSettings,
  ClassificationThresholds,
} from "./types";

export const ANALYSIS_PRESETS = {
  quick: { label: "Quick", depth: 12 },
  standard: { label: "Standard", depth: 15 },
  deep: { label: "Deep", depth: 18 },
} as const;

export type SelectablePreset = keyof typeof ANALYSIS_PRESETS;

/**
 * Thresholds are documented in README.md. Values are expected-points losses in
 * the range 0..1, not raw centipawns.
 */
export const DEFAULT_CLASSIFICATION_THRESHOLDS: ClassificationThresholds = {
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
};

/** Empirical logistic slope matching Stockfish WDL around small advantages. */
export const DEFAULT_CENTIPAWN_SLOPE = 0.00368208;

export function createAnalysisSettings(
  preset: SelectablePreset = "standard",
): AnalysisSettings {
  return {
    preset,
    depth: ANALYSIS_PRESETS[preset].depth,
    multiPv: 1,
    expectedPoints: {
      useEngineWdl: true,
      centipawnSlope: DEFAULT_CENTIPAWN_SLOPE,
    },
    classification: { ...DEFAULT_CLASSIFICATION_THRESHOLDS },
    bookClassification: false,
  };
}

export function createCustomSettings(depth: number): AnalysisSettings {
  const settings = createAnalysisSettings("standard");
  return {
    ...settings,
    preset: "custom",
    depth: Number.isInteger(depth) && depth > 0 ? depth : settings.depth,
  };
}

function normalizePromotion(value: string | undefined): string {
  return value ? value.toLowerCase() : "";
}

export function playedMovesSignature(game: NormalizedGame): string {
  return game.moves
    .map((move) => `${move.from}${move.to}${normalizePromotion(move.promotion)}`)
    .join(",");
}

/** Stable identity used to reject results from an old game or settings. */
export function createAnalysisIdentity(
  game: NormalizedGame,
  settings: AnalysisSettings,
): AnalysisIdentity {
  const playedMoves = playedMovesSignature(game);
  const key = [
    game.id,
    game.initialFen,
    playedMoves,
    settings.preset,
    settings.depth,
    settings.multiPv,
    settings.expectedPoints.useEngineWdl ? 1 : 0,
    settings.expectedPoints.centipawnSlope,
    settings.bookClassification ? 1 : 0,
    JSON.stringify(settings.classification),
  ].join("|");

  return {
    gameId: game.id,
    initialFen: game.initialFen,
    playedMoves,
    preset: settings.preset,
    depth: settings.depth,
    multiPv: settings.multiPv,
    key,
  };
}
