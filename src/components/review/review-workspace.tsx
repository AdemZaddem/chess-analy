"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Check,
  Copy,
  GitBranch,
  Upload,
} from "lucide-react";
import type { ChessboardOptions } from "react-chessboard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EngineAnalysisPanel } from "@/components/game/engine-analysis-panel";
import { FullGameAnalysisPanel } from "@/components/game/full-game-analysis-panel";
import { GameMetadata as GameMetadataCard } from "@/components/game/game-metadata";
import { MoveList } from "@/components/game/move-list";
import { NavigationControls } from "@/components/game/navigation-controls";
import type { UseFullGameAnalysisResult } from "@/hooks/use-full-game-analysis";
import type { GameViewerState } from "@/hooks/use-game-viewer";
import { useVariation } from "@/hooks/use-variation";
import type {
  AnalysisSettings,
  MoveAnalysis,
  PositionEvaluation,
} from "@/lib/analysis/types";
import type { SelectablePreset } from "@/lib/analysis/settings";
import { getPositionStatus } from "@/lib/chess/game-navigation";
import type { NormalizedGame, PlayerInfo } from "@/lib/chess/types";
import { buildBoardAnnotations } from "@/lib/review/annotations";
import { buildEvaluationGraph } from "@/lib/review/evaluation";
import { BoardReviewHints } from "./board-review-hints";
import { EvaluationBar } from "./evaluation-bar";
import { EvaluationGraph } from "./evaluation-graph";
import { ReviewActions } from "./review-actions";
import { ReviewSummary } from "./review-summary";
import { VariationViewer } from "./variation-viewer";

const Chessboard = dynamic(
  () => import("react-chessboard").then((module) => module.Chessboard),
  {
    ssr: false,
    loading: () => (
      <div className="aspect-square w-full animate-pulse rounded-xl bg-surface-2" />
    ),
  },
);

function BoardPlayer({
  player,
  color,
  active,
}: {
  player: PlayerInfo;
  color: "White" | "Black";
  active: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-1 py-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className={`size-4 shrink-0 rounded-full border ${
            color === "White"
              ? "border-ink/40 bg-ink"
              : "border-white/10 bg-[#0c100e]"
          } ${active ? "ring-2 ring-accent/70 ring-offset-2 ring-offset-surface" : ""}`}
          aria-hidden
        />
        <span className="truncate text-sm font-medium text-ink">
          {player.title ? (
            <span className="mr-1 text-xs text-accent">{player.title}</span>
          ) : null}
          {player.name}
        </span>
      </div>
      {player.rating !== undefined ? (
        <span className="font-mono text-xs text-muted">{player.rating}</span>
      ) : null}
    </div>
  );
}

/**
 * Composes the single authoritative viewer state (game ply) with review-only
 * overlays (variation, selected evaluation, graph and annotations). Navigation
 * callbacks all route through `selectPly`, so no component keeps its own ply.
 */
export function ReviewWorkspace({
  game,
  viewer,
  analysis,
  settings,
  preset,
  onPresetChange,
  orientation,
  onFlip,
  onImportAnother,
}: {
  game: NormalizedGame;
  viewer: GameViewerState;
  analysis: UseFullGameAnalysisResult;
  settings: AnalysisSettings;
  preset: SelectablePreset;
  onPresetChange: (preset: SelectablePreset) => void;
  orientation: "white" | "black";
  onFlip: () => void;
  onImportAnother?: () => void;
}) {
  const [copiedFen, setCopiedFen] = useState<string | null>(null);
  const result = analysis.result;

  const selectedMove = useMemo<MoveAnalysis | undefined>(
    () => result?.moves.find((move) => move.ply === viewer.currentPly),
    [result, viewer.currentPly],
  );
  const positionEvaluation = useMemo<PositionEvaluation | null>(
    () =>
      result?.positions.find((position) => position.ply === viewer.currentPly)
        ?.evaluation ?? null,
    [result, viewer.currentPly],
  );
  const graphPoints = useMemo(() => buildEvaluationGraph(result), [result]);

  const variationMoves = useMemo(
    () => selectedMove?.principalVariationAfter ?? [],
    [selectedMove],
  );
  const variation = useVariation(viewer.fen, variationMoves);
  const displayFen = variation.fen;
  const displayedStatus = useMemo(() => getPositionStatus(displayFen), [displayFen]);
  const turn = displayFen.split(/\s+/)[1] === "w" ? "w" : "b";

  const annotations = useMemo(
    () =>
      buildBoardAnnotations({
        fen: displayFen,
        playedMove: variation.isActive ? null : viewer.lastMove,
        engineUci: variation.isActive ? undefined : positionEvaluation?.bestMove,
        variationMove: variation.currentMove
          ? { from: variation.currentMove.from, to: variation.currentMove.to }
          : null,
      }),
    [
      displayFen,
      variation.isActive,
      variation.currentMove,
      viewer.lastMove,
      positionEvaluation?.bestMove,
    ],
  );

  const boardOptions = useMemo<ChessboardOptions>(
    () => ({
      id: "movelens-board",
      position: displayFen,
      boardOrientation: orientation,
      allowDragging: false,
      allowDrawingArrows: false,
      clearArrowsOnClick: false,
      clearArrowsOnPositionChange: false,
      showNotation: true,
      animationDurationInMs: 180,
      darkSquareStyle: { backgroundColor: "#19342b" },
      lightSquareStyle: { backgroundColor: "#dce9df" },
      arrows: annotations.arrows,
      squareStyles: annotations.squareStyles,
      boardStyle: {
        borderRadius: "0.75rem",
        boxShadow: "0 24px 70px -36px rgba(0, 0, 0, 0.95)",
      },
    }),
    [displayFen, orientation, annotations],
  );

  const { exit: exitVariation } = variation;
  const { goTo: goToPly } = viewer;
  const selectPly = useCallback(
    (ply: number) => {
      exitVariation();
      goToPly(ply);
    },
    [exitVariation, goToPly],
  );

  const copyFen = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(displayFen);
      setCopiedFen(displayFen);
    } catch {
      setCopiedFen(null);
    }
  }, [displayFen]);

  const topColor = orientation === "white" ? "Black" : "White";
  const bottomColor = orientation === "white" ? "White" : "Black";
  const topPlayer = topColor === "White" ? game.metadata.white : game.metadata.black;
  const bottomPlayer =
    bottomColor === "White" ? game.metadata.white : game.metadata.black;
  const copied = copiedFen === displayFen;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-5">
        <Card className="p-3 sm:p-4">
          <div className="mx-auto w-full max-w-[620px]">
            <BoardPlayer
              player={topPlayer}
              color={topColor}
              active={topColor === (turn === "w" ? "White" : "Black")}
            />
            <div className="relative">
              <div className="absolute inset-y-0 left-0 z-10 w-4 sm:w-5">
                <EvaluationBar evaluation={positionEvaluation} orientation={orientation} />
              </div>
              <div className="pl-4 sm:pl-5">
                <Chessboard options={boardOptions} />
              </div>
            </div>
            <BoardPlayer
              player={bottomPlayer}
              color={bottomColor}
              active={bottomColor === (turn === "w" ? "White" : "Black")}
            />

            <BoardReviewHints
              move={selectedMove}
              annotations={annotations}
              variationActive={variation.isActive}
            />

            {variation.isActive ? (
              <p
                role="status"
                className="mt-2 flex items-center gap-2 rounded-lg border border-violet/30 bg-violet/10 px-2.5 py-1.5 text-[11px] text-violet"
              >
                <GitBranch className="size-3.5" aria-hidden />
                Viewing engine variation · move {variation.index} of{" "}
                {variation.line.moves.length}. The game itself is unchanged.
              </p>
            ) : null}

            <NavigationControls
              currentMove={viewer.currentMove}
              currentPly={viewer.currentPly}
              moveCount={game.moves.length}
              isAtStart={viewer.isAtStart}
              isAtEnd={viewer.isAtEnd}
              onFirst={() => {
                variation.exit();
                viewer.first();
              }}
              onPrevious={() => {
                variation.exit();
                viewer.previous();
              }}
              onNext={() => {
                variation.exit();
                viewer.next();
              }}
              onLast={() => {
                variation.exit();
                viewer.last();
              }}
            />

            {viewer.currentMove?.comment ? (
              <p className="mt-3 rounded-lg border border-line-soft bg-surface-2/60 p-3 text-xs leading-relaxed text-muted">
                <span className="font-medium text-ink">Comment: </span>
                {viewer.currentMove.comment}
              </p>
            ) : null}

            <div className="mt-3 rounded-xl border border-line-soft bg-canvas/50 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] uppercase tracking-wider text-muted">
                  {variation.isActive ? "Variation FEN" : "Current FEN"}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => void copyFen()}
                  aria-label="Copy displayed FEN"
                >
                  {copied ? (
                    <Check className="size-3.5 text-accent" aria-hidden />
                  ) : (
                    <Copy className="size-3.5" aria-hidden />
                  )}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <p className="scrollbar-subtle mt-1 overflow-x-auto whitespace-nowrap font-mono text-[11px] text-ink/80">
                {displayFen}
              </p>
              <p className="mt-1.5 text-[11px] text-muted">
                To move: {turn === "w" ? game.metadata.white.name : game.metadata.black.name} ·{" "}
                {displayedStatus}
              </p>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="mt-2 w-full"
              onClick={onFlip}
            >
              <ArrowLeftRight className="size-4" aria-hidden />
              Flip board
            </Button>
          </div>
        </Card>

        <VariationViewer variation={variation} playedSan={selectedMove?.san} />

        <EvaluationGraph
          points={graphPoints}
          selectedPly={viewer.currentPly}
          onSelectPly={selectPly}
        />
      </div>

      <div className="min-w-0 space-y-5">
        <ReviewSummary game={game} analysis={result} onSelectPly={selectPly} />
        <ReviewActions game={game} settings={settings} analysis={result} />
        <FullGameAnalysisPanel
          settings={settings}
          preset={preset}
          onPresetChange={onPresetChange}
          selectedPly={viewer.currentPly}
          analysis={analysis}
        />
        <MoveList
          moves={game.moves}
          currentPly={viewer.currentPly}
          onSelect={selectPly}
          analysis={result}
        />
        <EngineAnalysisPanel fen={displayFen} />
        <GameMetadataCard game={game} turn={turn} />
        {onImportAnother ? (
          <Button variant="secondary" size="sm" className="w-full" onClick={onImportAnother}>
            <Upload className="size-4" aria-hidden />
            Import another game
          </Button>
        ) : null}
      </div>
    </div>
  );
}
