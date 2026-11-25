"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { MoveRecord } from "@/lib/chess/types";

interface MoveRow {
  number: number;
  white?: MoveRecord;
  black?: MoveRecord;
}

export function MoveList({
  moves,
  currentPly,
  onSelect,
}: {
  moves: MoveRecord[];
  currentPly: number;
  onSelect: (ply: number) => void;
}) {
  const rows = useMemo<MoveRow[]>(() => {
    const result: MoveRow[] = [];
    for (let index = 0; index < moves.length; index += 2) {
      result.push({
        number: moves[index]?.moveNumber ?? 0,
        white: moves[index],
        black: moves[index + 1],
      });
    }
    return result;
  }, [moves]);

  function MoveButton({ move }: { move?: MoveRecord }) {
    if (!move) return <span className="h-8" />;
    const active = currentPly === move.ply;

    return (
      <button
        type="button"
        onClick={() => onSelect(move.ply)}
        aria-current={active ? "step" : undefined}
        className={cn(
          "h-8 min-w-0 flex-1 truncate rounded-md px-2 text-left font-mono text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
          active
            ? "bg-accent font-semibold text-emerald-950"
            : "text-ink hover:bg-surface-3",
        )}
      >
        {move.san}
      </button>
    );
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between py-4">
        <CardTitle>Move list</CardTitle>
        <Badge>{moves.length} plies</Badge>
      </CardHeader>
      <CardContent className="p-2 sm:p-3">
        {rows.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted">
            This PGN has no moves. The starting position is shown on the board.
          </p>
        ) : (
          <ol className="scrollbar-subtle max-h-80 space-y-0.5 overflow-y-auto pr-1">
            {rows.map((row, index) => (
              <li
                key={`${row.number}-${index}`}
                className="flex items-center gap-1 rounded-md px-1 py-0.5 even:bg-surface-2/40"
              >
                <span className="w-8 shrink-0 text-right font-mono text-xs text-muted">
                  {row.number}.
                </span>
                <MoveButton move={row.white} />
                <MoveButton move={row.black} />
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
