"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CLASSIFICATION_LABELS, type ClassificationTone } from "@/lib/analysis/labels";
import type { FullGameAnalysis, MoveClassification } from "@/lib/analysis/types";
import type { MoveRecord } from "@/lib/chess/types";

const toneClasses: Record<ClassificationTone, string> = {
  neutral: "text-muted",
  success: "text-accent",
  violet: "text-violet",
  warning: "text-amber-200",
};

interface MoveRow {
  number: number;
  white?: MoveRecord;
  black?: MoveRecord;
}

function MoveButton({
  move,
  currentPly,
  classification,
  onSelect,
}: {
  move?: MoveRecord;
  currentPly: number;
  classification?: MoveClassification;
  onSelect: (ply: number) => void;
}) {
  if (!move) return <span className="h-8" />;
  const active = currentPly === move.ply;
  const meta = classification ? CLASSIFICATION_LABELS[classification] : undefined;

  return (
    <button
      type="button"
      onClick={() => onSelect(move.ply)}
      aria-current={active ? "step" : undefined}
      aria-label={`${move.moveNumber}${move.color === "b" ? "..." : "."} ${move.san}${meta ? `, ${meta.label}` : ""}`}
      data-ply={move.ply}
      className={cn(
        "flex h-8 min-w-0 flex-1 items-center gap-1 rounded-md px-2 text-left font-mono text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
        active
          ? "bg-accent font-semibold text-emerald-950"
          : "text-ink hover:bg-surface-3",
      )}
    >
      <span className="truncate">{move.san}</span>
      {meta ? (
        <span
          className={cn(
            "shrink-0 font-sans text-[10px] font-bold",
            active ? "text-emerald-950" : toneClasses[meta.tone],
          )}
          title={`${meta.label} move`}
          aria-hidden
        >
          {meta.symbol}
        </span>
      ) : null}
    </button>
  );
}

export function MoveList({
  moves,
  currentPly,
  onSelect,
  analysis,
}: {
  moves: MoveRecord[];
  currentPly: number;
  onSelect: (ply: number) => void;
  analysis?: FullGameAnalysis | null;
}) {
  const classifications = useMemo(
    () =>
      new Map(
        (analysis?.moves ?? []).map((move) => [move.ply, move.classification]),
      ),
    [analysis],
  );

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
                <MoveButton
                  move={row.white}
                  currentPly={currentPly}
                  classification={row.white ? classifications.get(row.white.ply) : undefined}
                  onSelect={onSelect}
                />
                <MoveButton
                  move={row.black}
                  currentPly={currentPly}
                  classification={row.black ? classifications.get(row.black.ply) : undefined}
                  onSelect={onSelect}
                />
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
