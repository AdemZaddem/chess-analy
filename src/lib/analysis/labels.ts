import type { MoveClassification } from "./types";

export type ClassificationTone = "neutral" | "success" | "violet" | "warning";

export const CLASSIFICATION_LABELS: Record<
  MoveClassification,
  { label: string; symbol: string; tone: ClassificationTone }
> = {
  brilliant: { label: "Brilliant", symbol: "!!", tone: "violet" },
  great: { label: "Great", symbol: "!", tone: "violet" },
  best: { label: "Best", symbol: "★", tone: "success" },
  excellent: { label: "Excellent", symbol: "✓", tone: "success" },
  good: { label: "Good", symbol: "•", tone: "neutral" },
  book: { label: "Book", symbol: "B", tone: "neutral" },
  inaccuracy: { label: "Inaccuracy", symbol: "?!", tone: "warning" },
  mistake: { label: "Mistake", symbol: "?", tone: "warning" },
  blunder: { label: "Blunder", symbol: "??", tone: "warning" },
  missedWin: { label: "Missed win", symbol: "MW", tone: "warning" },
};
