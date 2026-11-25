"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Sparkles, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReviewWorkspace } from "@/components/review/review-workspace";
import { useGameViewer } from "@/hooks/use-game-viewer";
import {
  createAnalysisSettings,
  type SelectablePreset,
} from "@/lib/analysis/settings";
import type { PositionStatus } from "@/lib/chess/game-navigation";
import type { GameSource, NormalizedGame } from "@/lib/chess/types";
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
    return `Imported from Chess.com · ${source.gameType} #${source.gameId}`;
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
}: {
  game: NormalizedGame;
  onReset: () => void;
  onImportAnother?: () => void;
}) {
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [analysisPreset, setAnalysisPreset] =
    useState<SelectablePreset>("standard");
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
        <div className="flex items-center gap-3">
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
          <div>
            <h2 className="text-sm font-semibold text-ink">
              {game.metadata.white.name} vs {game.metadata.black.name}
            </h2>
            <p className="text-xs text-muted">
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

      <FullGameReviewHost key={analysisKey} game={game} settings={analysisSettings}>
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
