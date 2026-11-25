"use client";

import { useMemo } from "react";
import { Award, Flame, Target, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CLASSIFICATION_LABELS } from "@/lib/analysis/labels";
import type { FullGameAnalysis } from "@/lib/analysis/types";
import type { GameResult, NormalizedGame } from "@/lib/chess/types";
import {
  biggestMistakes,
  buildKeyMoments,
  strongestMoves,
} from "@/lib/review/key-moments";

const RESULT_LABELS: Record<GameResult, string> = {
  "1-0": "White won",
  "0-1": "Black won",
  "1/2-1/2": "Draw",
  "*": "Unfinished",
};

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function momentIcon(kind: string) {
  if (kind === "blunder" || kind === "missedWin") return <Flame className="size-3.5" aria-hidden />;
  if (kind === "brilliant" || kind === "great") return <Award className="size-3.5" aria-hidden />;
  return <Target className="size-3.5" aria-hidden />;
}

/** Compact review summary plus data-driven key moments. */
export function ReviewSummary({
  game,
  analysis,
  onSelectPly,
}: {
  game: NormalizedGame;
  analysis: FullGameAnalysis | null | undefined;
  onSelectPly: (ply: number) => void;
}) {
  const moments = useMemo(() => buildKeyMoments(analysis), [analysis]);
  const mistakes = useMemo(() => biggestMistakes(analysis), [analysis]);
  const strongest = useMemo(() => strongestMoves(analysis), [analysis]);

  if (!analysis) {
    return (
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Review summary</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <p className="text-xs leading-relaxed text-muted">
            Accuracy and key moments appear after a full-game analysis.
          </p>
        </CardContent>
      </Card>
    );
  }

  const countRows = [
    { key: "brilliant", label: "Brilliant" },
    { key: "great", label: "Great" },
    { key: "inaccuracy", label: "Inaccuracies" },
    { key: "mistake", label: "Mistakes" },
    { key: "blunder", label: "Blunders" },
    { key: "missedWin", label: "Missed wins" },
  ] as const;

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2 py-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Trophy className="size-4 text-accent" aria-hidden />
          Review summary
        </CardTitle>
        <Badge variant={game.metadata.result === "*" ? "neutral" : "success"}>
          {game.metadata.result} · {RESULT_LABELS[game.metadata.result]}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4 p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-line-soft bg-surface-2/50 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted">White accuracy</p>
            <p className="text-xl font-semibold text-ink">{formatPercent(analysis.accuracy.white.accuracy)}</p>
          </div>
          <div className="rounded-lg border border-line-soft bg-surface-2/50 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted">Black accuracy</p>
            <p className="text-xl font-semibold text-ink">{formatPercent(analysis.accuracy.black.accuracy)}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {countRows.map((row) => (
            <div key={row.key} className="rounded-lg border border-line-soft bg-surface-2/40 p-2 text-center">
              <p className="text-base font-semibold text-ink">{analysis.counts[row.key]}</p>
              <p className="text-[10px] uppercase tracking-wide text-muted">{row.label}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
          <span>{analysis.moves.length} moves</span>
          <span>{analysis.positions.length} positions</span>
          <span>depth {analysis.settings.depth}</span>
          {game.metadata.opening ? <span>{game.metadata.opening}</span> : null}
          {game.metadata.eco ? <span>{game.metadata.eco}</span> : null}
        </div>

        <section aria-label="Key moments" className="space-y-2 border-t border-line-soft pt-3">
          <h3 className="text-[11px] uppercase tracking-wider text-muted">Key moments</h3>
          {moments.length === 0 ? (
            <p className="text-xs text-muted">No qualifying turning points in this game.</p>
          ) : (
            <ol className="space-y-1.5">
              {moments.map((moment) => (
                <li key={moment.id}>
                  <button
                    type="button"
                    onClick={() => onSelectPly(moment.ply)}
                    className="flex w-full gap-2 rounded-lg border border-line-soft bg-surface-2/40 px-2.5 py-2 text-left transition-colors hover:border-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                  >
                    <span className="mt-0.5 shrink-0 text-accent">{momentIcon(moment.kind)}</span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-medium text-ink">{moment.label}</span>
                        <span className="font-mono text-[10px] text-muted">
                          {moment.ply}. {moment.move.san}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">
                        {moment.detail}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>

        <div className="grid gap-3 border-t border-line-soft pt-3 sm:grid-cols-2">
          <section aria-label="Biggest mistakes">
            <h3 className="text-[11px] uppercase tracking-wider text-muted">Biggest losses</h3>
            {mistakes.length === 0 ? (
              <p className="mt-1.5 text-xs text-muted">No expected-points losses.</p>
            ) : (
              <ul className="mt-1.5 space-y-1">
                {mistakes.map((move) => (
                  <li key={`mistake-${move.ply}`}>
                    <button
                      type="button"
                      onClick={() => onSelectPly(move.ply)}
                      className="flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                    >
                      <span className="font-mono text-ink">{move.san}</span>
                      <span className="text-muted">−{move.expectedPointsLoss.toFixed(3)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-label="Strongest moves">
            <h3 className="text-[11px] uppercase tracking-wider text-muted">Strongest moves</h3>
            {strongest.length === 0 ? (
              <p className="mt-1.5 text-xs text-muted">No qualifying strong moves.</p>
            ) : (
              <ul className="mt-1.5 space-y-1">
                {strongest.map((move) => (
                  <li key={`strong-${move.ply}`}>
                    <button
                      type="button"
                      onClick={() => onSelectPly(move.ply)}
                      className="flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                    >
                      <span className="font-mono text-ink">
                        {CLASSIFICATION_LABELS[move.classification].symbol} {move.san}
                      </span>
                      <span className="text-muted">{move.expectedPointsAfter.toFixed(3)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </CardContent>
    </Card>
  );
}
