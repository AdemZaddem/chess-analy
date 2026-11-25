"use client";

import type { ReactNode } from "react";
import {
  useFullGameAnalysis,
  type FullGameAnalysisEvent,
  type UseFullGameAnalysisResult,
} from "@/hooks/use-full-game-analysis";
import { createAnalysisIdentity } from "@/lib/analysis/settings";
import type { AnalysisSettings, FullGameAnalysis } from "@/lib/analysis/types";
import type { NormalizedGame } from "@/lib/chess/types";

/**
 * Owns the full-game analysis state for one game/settings identity. The caller
 * supplies `fullGameReviewKey(game, settings)` as React `key`; changing game or
 * preset remounts this component, which aborts old work through React cleanup.
 */
export function FullGameReviewHost({
  game,
  settings,
  initialResult,
  onAnalysisEvent,
  children,
}: {
  game: NormalizedGame;
  settings: AnalysisSettings;
  initialResult?: FullGameAnalysis | null;
  onAnalysisEvent?: (event: FullGameAnalysisEvent) => void;
  children: (analysis: UseFullGameAnalysisResult) => ReactNode;
}) {
  const analysis = useFullGameAnalysis(game, settings, {
    initialResult,
    onEvent: onAnalysisEvent,
  });
  return <>{children(analysis)}</>;
}

export function fullGameReviewKey(
  game: NormalizedGame,
  settings: AnalysisSettings,
): string {
  return createAnalysisIdentity(game, settings).key;
}
