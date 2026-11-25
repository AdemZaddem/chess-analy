import { expectedPointsForPlayer, expectedPointsLoss } from "./expected-points";
import type {
  AnalysisSettings,
  ClassificationResult,
  GamePosition,
  MoveClassification,
  PositionEvaluation,
  PositionMove,
} from "./types";

/**
 * Explicit priority: a move can receive only the first matching label.
 * Book is intentionally present in the type but deferred by the classifier:
 * the app has PGN-level opening metadata, not a move-by-move opening database.
 */
export const CLASSIFICATION_PRIORITY: ReadonlyArray<{
  rule: string;
  label: MoveClassification;
}> = [
  { rule: "forced move", label: "best" },
  { rule: "missed win", label: "missedWin" },
  { rule: "blunder", label: "blunder" },
  { rule: "mistake", label: "mistake" },
  { rule: "inaccuracy", label: "inaccuracy" },
  { rule: "brilliant sacrifice", label: "brilliant" },
  { rule: "great tactical move", label: "great" },
  { rule: "engine best move", label: "best" },
  { rule: "excellent move", label: "excellent" },
  { rule: "good move", label: "good" },
  // Book moves are deferred; no reliable local move-by-move database exists.
];

export interface ClassificationInput {
  settings: AnalysisSettings;
  positionBefore: GamePosition;
  positionAfter: GamePosition;
  evaluationBefore: PositionEvaluation;
  evaluationAfter: PositionEvaluation;
}

export function isSacrificingMove(
  move: PositionMove,
  settings: AnalysisSettings,
): boolean {
  return (
    !move.isRecapture &&
    !move.isPromotion &&
    !move.isForced &&
    move.materialDelta <= -settings.classification.sacrificeMaterialThreshold
  );
}

function formatLoss(loss: number): string {
  return `Expected-points loss ${loss.toFixed(3)}`;
}

/**
 * Deterministic classifier. Stockfish supplies evaluations and best moves;
 * all labels below are our own documented heuristics.
 */
export function classifyMove(input: ClassificationInput): ClassificationResult {
  const { settings, positionBefore, positionAfter, evaluationBefore, evaluationAfter } = input;
  const move = positionAfter.move;
  if (!move) {
    throw new Error("Cannot classify a position without a played move.");
  }

  const before = expectedPointsForPlayer(
    evaluationBefore.expectedPointsWhite,
    move.color,
  );
  const after = expectedPointsForPlayer(
    evaluationAfter.expectedPointsWhite,
    move.color,
  );
  const loss = expectedPointsLoss(before, after);
  const gain = after - before;
  const isBestMove = evaluationBefore.bestMove === move.uci;
  const uncertain = evaluationBefore.uncertain || evaluationAfter.uncertain;
  const thresholds = settings.classification;
  const scale = uncertain ? thresholds.uncertainThresholdMultiplier : 1;
  const reasons: string[] = [formatLoss(loss)];
  const sacrifice = isSacrificingMove(move, settings);

  let classification: MoveClassification;

  if (move.isForced) {
    classification = "best";
    reasons.push("Only one legal move was available; no alternative can be evaluated.");
  } else if (
    !uncertain &&
    before >= thresholds.missedWinBefore &&
    after <= thresholds.missedWinAfter &&
    loss >= thresholds.missedWinMinLoss
  ) {
    classification = "missedWin";
    reasons.push("A clearly winning position was reduced to an unresolved or worse result.");
  } else if (loss >= thresholds.blunder * scale) {
    classification = "blunder";
    reasons.push("Large expected-points loss.");
  } else if (loss >= thresholds.mistake * scale) {
    classification = "mistake";
    reasons.push("Significant expected-points loss.");
  } else if (loss >= thresholds.inaccuracy * scale) {
    classification = "inaccuracy";
    reasons.push("Measurable expected-points loss.");
  } else if (
    !uncertain &&
    loss <= thresholds.specialMoveMaxLoss &&
    isBestMove &&
    sacrifice &&
    after >= thresholds.brilliantAfter &&
    (gain >= thresholds.brilliantMinGain || after >= 0.85)
  ) {
    classification = "brilliant";
    reasons.push("Engine-endorsed material sacrifice with a favorable resulting evaluation.");
  } else if (
    !uncertain &&
    loss <= thresholds.specialMoveMaxLoss &&
    isBestMove &&
    !move.isRecapture &&
    before <= thresholds.greatBeforeMax &&
    after >= thresholds.greatAfter &&
    gain >= thresholds.greatMinGain &&
    (move.isCapture || move.isPromotion || move.givesCheck ||
      positionBefore.legalMoveCount >= thresholds.greatComplexLegalMoves)
  ) {
    classification = "great";
    reasons.push("Engine-best tactical move converted an unresolved position into a clear advantage.");
  } else if (isBestMove && loss <= thresholds.bestMaxLoss) {
    classification = "best";
    reasons.push("Matches the engine's top move.");
  } else if (loss <= thresholds.excellentMaxLoss) {
    classification = "excellent";
    reasons.push("Very small expected-points loss.");
  } else {
    classification = "good";
    reasons.push("No threshold for a stronger positive or negative label was met.");
  }

  if (uncertain) {
    reasons.push("Evaluation was incomplete or shallower than requested; special labels withheld.");
  }
  if (sacrifice && classification !== "brilliant") {
    reasons.push("Material sacrifice did not satisfy every brilliant-move condition.");
  }

  return {
    classification,
    reasons,
    expectedPointsBefore: before,
    expectedPointsAfter: after,
    expectedPointsLoss: loss,
    isBestMove,
    uncertain,
  };
}
