"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, FolderOpen, LoaderCircle, Sparkles, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReviewWorkspace } from "@/components/review/review-workspace";
import type { FullGameAnalysisEvent } from "@/hooks/use-full-game-analysis";
import { useGameViewer } from "@/hooks/use-game-viewer";
import type { FullGameAnalysis } from "@/lib/analysis/types";
import {
  createAnalysisSettings,
  type SelectablePreset,
} from "@/lib/analysis/settings";
import type { PositionStatus } from "@/lib/chess/game-navigation";
import type { GameSource, NormalizedGame } from "@/lib/chess/types";
import type { ReviewAnalysisState } from "@/lib/storage/schema";
import {
  FullGameReviewHost,
  fullGameReviewKey,
} from "./full-game-review-host";

const statusLabels: Record<PositionStatus, string> = {
  ongoing: "In play",
  check: "Check",
  checkmate: "Checkmate",
  stalemate: "Stalemate",
  draw: "Draw",
};

function sourceLabel(source: GameSource): string {
  if (source.kind === "chesscom") {
    return `Imported from Chess.com · ${source.gameType} #${source.gameId}${source.username ? ` · ${source.username}` : ""}`;
  }
  if (source.kind === "file") return source.filename ?? "PGN file";
  return "Pasted PGN";
}

/**
 * Owns the single authoritative navigation state and analysis identity.
 * Game switching and preset changes remount the keyed analysis host; the ply
 * itself lives here, so changing depth does not move the board.
 */
export function GameViewer({
  game,
  onReset,
  onImportAnother,
  initialPreset = "standard",
  initialAnalysis = null,
  restoredState = "not-started",
  onAnalysisEvent,
  onOpenSaved,
}: {
  game: NormalizedGame;
  onReset: () => void;
  onImportAnother?: () => void;
  initialPreset?: SelectablePreset;
  initialAnalysis?: FullGameAnalysis | null;
  restoredState?: ReviewAnalysisState;
  onAnalysisEvent?: (event: FullGameAnalysisEvent) => void;
  onOpenSaved?: () => void;
}) {
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [analysisPreset, setAnalysisPreset] =
    useState<SelectablePreset>(initialPreset);
  const analysisSettings = useMemo(
    () => createAnalysisSettings(analysisPreset),
    [analysisPreset],
  );
  const analysisKey = fullGameReviewKey(game, analysisSettings);
  const viewer = useGameViewer(game);
  const { first, last, next, previous } = viewer;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (
        (target instanceof HTMLElement &&
          target.closest("input, textarea, select, [contenteditable='true']")) ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        previous();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        next();
      } else if (event.key === "Home") {
        event.preventDefault();
        first();
      } else if (event.key === "End") {
        event.preventDefault();
        last();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [first, last, next, previous]);

  const flip = useCallback(() => {
    setOrientation((current) => (current === "white" ? "black" : "white"));
  }, []);

  return (
    <section className="space-y-5" aria-label="Game analysis workspace">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
          <Button variant="secondary" size="sm" onClick={onReset}>
            <ArrowLeft className="size-4" aria-hidden />
            New analysis
          </Button>
          {onImportAnother ? (
            <Button variant="ghost" size="sm" onClick={onImportAnother}>
              <Upload className="size-4" aria-hidden />
              Import another
            </Button>
          ) : null}
          {onOpenSaved ? (
            <Button variant="ghost" size="sm" onClick={onOpenSaved}>
              <FolderOpen className="size-4" aria-hidden />
              My reviews
            </Button>
          ) : null}
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-ink">
              {game.metadata.white.name} vs {game.metadata.black.name}
            </h2>
            <p className="truncate text-xs text-muted">
              {game.gameCount > 1
                ? `Game ${game.gameIndex} of ${game.gameCount}`
                : sourceLabel(game.source)}
            </p>
          </div>
        </div>
        <Badge
          variant={
            viewer.status === "checkmate" || viewer.status === "stalemate"
              ? "violet"
              : viewer.status === "check"
                ? "warning"
                : "success"
          }
        >
          <Sparkles className="size-3" aria-hidden />
          {statusLabels[viewer.status]}
        </Badge>
      </div>

      {game.source.kind === "chesscom" ? (
        <p
          role="status"
          className="rounded-xl border border-accent/25 bg-accent/10 px-4 py-2.5 text-sm text-ink"
        >
          Successfully imported Chess.com {game.source.gameType} game{" "}
          <span className="font-mono">{game.source.gameId}</span> using username{" "}
          <span className="font-medium">{game.source.username}</span>.
        </p>
      ) : null}

      {restoredState === "running" || restoredState === "incomplete" ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-2.5 text-xs leading-relaxed text-amber-100/90"
        >
          <LoaderCircle className="size-3.5 shrink-0" aria-hidden />
          {restoredState === "running"
            ? "A previous analysis was interrupted. The game and settings were restored; run the review again to continue."
            : "This review was saved without a completed analysis. Run it locally when you are ready."}
        </p>
      ) : null}

      <FullGameReviewHost
        key={analysisKey}
        game={game}
        settings={analysisSettings}
        initialResult={initialAnalysis}
        onAnalysisEvent={onAnalysisEvent}
      >
        {(analysis) => (
          <ReviewWorkspace
            game={game}
            viewer={viewer}
            analysis={analysis}
            settings={analysisSettings}
            preset={analysisPreset}
            onPresetChange={setAnalysisPreset}
            orientation={orientation}
            onFlip={flip}
            onImportAnother={onImportAnother}
          />
        )}
      </FullGameReviewHost>
    </section>
  );
}
