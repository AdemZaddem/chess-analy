"use client";

import type { ReactNode } from "react";
import {
  useFullGameAnalysis,
  type UseFullGameAnalysisResult,
} from "@/hooks/use-full-game-analysis";
import { createAnalysisIdentity } from "@/lib/analysis/settings";
import type { AnalysisSettings } from "@/lib/analysis/types";
import type { NormalizedGame } from "@/lib/chess/types";

/**
 * Owns the full-game analysis state for one game/settings identity. The caller
 * supplies `fullGameReviewKey(game, settings)` as React `key`; changing game or
 * preset remounts this component, which aborts old work through React cleanup.
 */
export function FullGameReviewHost({
  game,
  settings,
  children,
}: {
  game: NormalizedGame;
  settings: AnalysisSettings;
  children: (analysis: UseFullGameAnalysisResult) => ReactNode;
}) {
  const analysis = useFullGameAnalysis(game, settings);
  return <>{children(analysis)}</>;
}

export function fullGameReviewKey(
  game: NormalizedGame,
  settings: AnalysisSettings,
): string {
  return createAnalysisIdentity(game, settings).key;
}
