"use client";

import { useCallback, useMemo, useState } from "react";
import {
  buildVariation,
  type VariationLine,
  type VariationMove,
} from "@/lib/review/variation";

export interface VariationState {
  line: VariationLine;
  baseFen: string;
  /** 0 is the actual game position; 1..n are moves into the variation. */
  index: number;
  fen: string;
  isActive: boolean;
  currentMove?: VariationMove;
  enter: () => void;
  exit: () => void;
  next: () => void;
  previous: () => void;
  goTo: (index: number) => void;
}

/**
 * Variation state is an explicit overlay on the authoritative game ply. It
 * never writes to `useGameViewer`, so exploring a PV cannot corrupt history.
 * The index is stored together with the base position/PV identity, so changing
 * game or selected move automatically presents index 0 without an effect that
 * would cause an extra render.
 */
export function useVariation(baseFen: string, uciMoves: string[]): VariationState {
  const uciKey = uciMoves.join(",");
  const key = `${baseFen}\u0000${uciKey}`;
  const moves = useMemo(() => (uciKey ? uciKey.split(",") : []), [uciKey]);
  const line = useMemo(() => buildVariation(baseFen, moves), [baseFen, moves]);
  const [stored, setStored] = useState(() => ({ key, index: 0 }));
  const index = stored.key === key ? stored.index : 0;

  const setIndex = useCallback(
    (value: number | ((current: number) => number)) => {
      setStored((previous) => {
        const current = previous.key === key ? previous.index : 0;
        const next = typeof value === "function" ? value(current) : value;
        if (!Number.isFinite(next)) return previous;
        return {
          key,
          index: Math.min(line.moves.length, Math.max(0, Math.trunc(next))),
        };
      });
    },
    [key, line.moves.length],
  );

  const goTo = useCallback((next: number) => setIndex(next), [setIndex]);
  const enter = useCallback(() => {
    if (line.moves.length) setIndex((current) => (current > 0 ? current : 1));
  }, [line.moves.length, setIndex]);
  const exit = useCallback(() => setIndex(0), [setIndex]);
  const next = useCallback(() => setIndex((current) => current + 1), [setIndex]);
  const previous = useCallback(() => setIndex((current) => current - 1), [setIndex]);

  return {
    line,
    baseFen,
    index,
    fen: index === 0 ? baseFen : (line.moves[index - 1]?.fenAfter ?? baseFen),
    isActive: index > 0,
    ...(line.moves[index - 1] ? { currentMove: line.moves[index - 1] } : {}),
    enter,
    exit,
    next,
    previous,
    goTo,
  };
}
