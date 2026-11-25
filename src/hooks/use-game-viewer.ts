"use client";

import { useCallback, useMemo, useState } from "react";
import {
  buildTimeline,
  clampPly,
  firstPly,
  getPositionStatus,
  lastPly,
  nextPly,
  previousPly,
} from "@/lib/chess/game-navigation";
import type { MoveRecord, NormalizedGame } from "@/lib/chess/types";

export interface GameViewerState {
  currentPly: number;
  fen: string;
  status: ReturnType<typeof getPositionStatus>;
  currentMove?: MoveRecord;
  lastMove?: { from: string; to: string };
  isAtStart: boolean;
  isAtEnd: boolean;
  goTo: (ply: number) => void;
  first: () => void;
  last: () => void;
  next: () => void;
  previous: () => void;
}

/** Keeps navigation state tied to the game instance, so a new import resets to ply 0. */
export function useGameViewer(game: NormalizedGame): GameViewerState {
  const [navigation, setNavigation] = useState(() => ({
    game,
    ply: 0,
  }));
  const timeline = useMemo(() => buildTimeline(game), [game]);
  const moveCount = game.moves.length;

  const activePly = navigation.game === game ? navigation.ply : 0;
  const setPly = useCallback(
    (update: (ply: number) => number) => {
      setNavigation((current) => ({
        game,
        ply: update(current.game === game ? current.ply : 0),
      }));
    },
    [game],
  );

  const index = clampPly(activePly, moveCount);
  const position = timeline[index] ?? timeline[0];
  const status = useMemo(
    () => getPositionStatus(position.fen),
    [position.fen],
  );
  const lastMove = useMemo(
    () => (position.move ? { from: position.move.from, to: position.move.to } : undefined),
    [position.move],
  );

  const goTo = useCallback(
    (ply: number) => setPly(() => clampPly(ply, moveCount)),
    [moveCount, setPly],
  );
  const first = useCallback(() => goTo(firstPly()), [goTo]);
  const last = useCallback(() => goTo(lastPly(moveCount)), [goTo, moveCount]);
  const next = useCallback(
    () => setPly((ply) => nextPly(ply, moveCount)),
    [moveCount, setPly],
  );
  const previous = useCallback(() => setPly(previousPly), [setPly]);

  return {
    currentPly: index,
    fen: position.fen,
    status,
    currentMove: position.move,
    lastMove,
    isAtStart: index === 0,
    isAtEnd: index === moveCount,
    goTo,
    first,
    last,
    next,
    previous,
  };
}
