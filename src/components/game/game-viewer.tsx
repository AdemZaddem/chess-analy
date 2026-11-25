"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowLeftRight,
  Check,
  Copy,
  Sparkles,
  Upload,
} from "lucide-react";
import type { ChessboardOptions } from "react-chessboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useGameViewer } from "@/hooks/use-game-viewer";
import type { PositionStatus } from "@/lib/chess/game-navigation";
import type {
  GameMetadata,
  GameSource,
  NormalizedGame,
  PlayerInfo,
} from "@/lib/chess/types";
import { GameMetadata as GameMetadataCard } from "./game-metadata";
import { MoveList } from "./move-list";
import { NavigationControls } from "./navigation-controls";

const Chessboard = dynamic(
  () => import("react-chessboard").then((module) => module.Chessboard),
  {
    ssr: false,
    loading: () => (
      <div className="aspect-square w-full animate-pulse rounded-xl bg-surface-2" />
    ),
  },
);

const statusLabels: Record<PositionStatus, string> = {
  ongoing: "In play",
  check: "Check",
  checkmate: "Checkmate",
  stalemate: "Stalemate",
  draw: "Draw",
};

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

function getActivePlayer(metadata: GameMetadata, turn: "w" | "b"): PlayerInfo {
  return turn === "w" ? metadata.white : metadata.black;
}

function sourceLabel(source: GameSource): string {
  if (source.kind === "chesscom") {
    return `Imported from Chess.com · ${source.gameType} #${source.gameId}`;
  }
  if (source.kind === "file") return source.filename ?? "PGN file";
  return "Pasted PGN";
}

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
  const [copiedFen, setCopiedFen] = useState<string | null>(null);
  const viewer = useGameViewer(game);
  const copied = copiedFen === viewer.fen;
  const turn = viewer.fen.split(" ")[1] === "w" ? "w" : "b";

  const topColor = orientation === "white" ? "Black" : "White";
  const bottomColor = orientation === "white" ? "White" : "Black";
  const topPlayer =
    topColor === "White" ? game.metadata.white : game.metadata.black;
  const bottomPlayer =
    bottomColor === "White" ? game.metadata.white : game.metadata.black;
  const activePlayer = getActivePlayer(game.metadata, turn);

  const boardOptions = useMemo<ChessboardOptions>(
    () => ({
      id: "movelens-board",
      position: viewer.fen,
      boardOrientation: orientation,
      allowDragging: false,
      showNotation: true,
      animationDurationInMs: 180,
      darkSquareStyle: { backgroundColor: "#19342b" },
      lightSquareStyle: { backgroundColor: "#dce9df" },
      boardStyle: {
        borderRadius: "0.75rem",
        boxShadow: "0 24px 70px -36px rgba(0, 0, 0, 0.95)",
      },
      squareStyles: viewer.lastMove
        ? {
            [viewer.lastMove.from]: {
              backgroundColor: "rgba(250, 204, 21, 0.38)",
            },
            [viewer.lastMove.to]: {
              backgroundColor: "rgba(250, 204, 21, 0.5)",
            },
          }
        : {},
    }),
    [orientation, viewer.fen, viewer.lastMove],
  );

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

  const copyFen = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(viewer.fen);
      setCopiedFen(viewer.fen);
    } catch {
      setCopiedFen(null);
    }
  }, [viewer.fen]);

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

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="p-3 sm:p-4">
          <div className="mx-auto w-full max-w-[620px]">
            <BoardPlayer
              player={topPlayer}
              color={topColor}
              active={topColor === (turn === "w" ? "White" : "Black")}
            />
            <Chessboard options={boardOptions} />
            <BoardPlayer
              player={bottomPlayer}
              color={bottomColor}
              active={bottomColor === (turn === "w" ? "White" : "Black")}
            />

            <NavigationControls
              currentMove={viewer.currentMove}
              currentPly={viewer.currentPly}
              moveCount={game.moves.length}
              isAtStart={viewer.isAtStart}
              isAtEnd={viewer.isAtEnd}
              onFirst={viewer.first}
              onPrevious={viewer.previous}
              onNext={viewer.next}
              onLast={viewer.last}
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
                  Current FEN
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => void copyFen()}
                  aria-label="Copy current FEN"
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
                {viewer.fen}
              </p>
              <p className="mt-1.5 text-[11px] text-muted">
                To move: {activePlayer.name}
              </p>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="mt-2 w-full"
              onClick={() =>
                setOrientation((current) =>
                  current === "white" ? "black" : "white",
                )
              }
            >
              <ArrowLeftRight className="size-4" aria-hidden />
              Flip board
            </Button>
          </div>
        </Card>

        <div className="space-y-5">
          <GameMetadataCard game={game} turn={turn} />
          <MoveList
            moves={game.moves}
            currentPly={viewer.currentPly}
            onSelect={viewer.goTo}
          />
        </div>
      </div>
    </section>
  );
}
