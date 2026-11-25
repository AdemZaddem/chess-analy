"use client";

import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  Cpu,
  Loader2,
  Play,
  RotateCcw,
  Square,
} from "lucide-react";
import {
  useEngineAnalysis,
  type EngineUiStatus,
} from "@/hooks/use-engine-analysis";
import { ErrorAlert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const DEPTH_PRESETS = [10, 15, 20] as const;

const statusLabels: Record<EngineUiStatus, string> = {
  idle: "Not loaded",
  loading: "Loading engine",
  ready: "Ready",
  searching: "Analyzing",
  stopping: "Stopping",
  error: "Unavailable",
};

function formatPv(moves: string[]): string {
  return moves
    .map((move, index) =>
      index % 2 === 0 ? `${Math.floor(index / 2) + 1}. ${move}` : move,
    )
    .join(" ");
}

function formatNumber(value: number | undefined): string {
  return value === undefined
    ? "—"
    : new Intl.NumberFormat("en-US").format(value);
}

export function EngineAnalysisPanel({ fen }: { fen: string }) {
  const [depth, setDepth] = useState<number>(10);
  const engine = useEngineAnalysis(fen);
  const busy = engine.isLoading || engine.isSearching;
  const progress = engine.searchProgress;
  const result = engine.result;

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3 p-4">
        <CardTitle className="flex items-center gap-2">
          <Cpu className="size-4 text-accent" aria-hidden />
          Stockfish analysis
        </CardTitle>
        <Badge
          variant={
            engine.status === "error"
              ? "warning"
              : engine.status === "ready" || engine.status === "searching"
                ? "success"
                : "warning"
          }
        >
          {engine.identity?.name ?? statusLabels[engine.status]}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-4 p-4">
        <p className="flex gap-2 rounded-lg border border-amber-400/20 bg-amber-400/10 p-2.5 text-xs leading-relaxed text-amber-100/90">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            Stockfish runs locally in a Web Worker. Deeper searches use more CPU
            time; depth 20 can take noticeably longer on slower devices.
          </span>
        </p>

        <div className="space-y-2">
          <span className="text-[11px] uppercase tracking-wider text-muted">
            Search depth
          </span>
          <div
            role="group"
            aria-label="Search depth"
            className="flex flex-wrap gap-2"
          >
            {DEPTH_PRESETS.map((preset) => (
              <Button
                key={preset}
                type="button"
                variant={depth === preset ? "primary" : "secondary"}
                size="sm"
                aria-pressed={depth === preset}
                disabled={busy}
                onClick={() => setDepth(preset)}
              >
                Depth {preset}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => void engine.analyze({ depth })}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Play className="size-4" aria-hidden />
            )}
            {engine.status === "searching" ? "Analyzing…" : "Analyze position"}
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={() => void engine.stop()}
            disabled={!engine.isSearching && !engine.isLoading}
          >
            <Square className="size-3.5" aria-hidden />
            Stop analysis
          </Button>
        </div>

        {(engine.isLoading || engine.isSearching) && (
          <div
            role="status"
            aria-live="polite"
            className="space-y-2 rounded-xl border border-line-soft bg-surface-2/60 p-3 text-xs text-muted"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-ink">
                <Activity className="size-3.5 text-accent" aria-hidden />
                {engine.isLoading
                  ? "Loading local engine…"
                  : `Searching depth ${progress?.depth ?? depth}`}
              </span>
              <span>{statusLabels[engine.status]}</span>
            </div>
            {engine.downloadProgress ? (
              <div className="space-y-1">
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                  <div
                    className="h-full rounded-full bg-accent transition-[width]"
                    style={{
                      width: `${Math.round(engine.downloadProgress.percent * 100)}%`,
                    }}
                  />
                </div>
                <p>
                  {Math.round(engine.downloadProgress.percent * 100)}% ·{" "}
                  {formatNumber(engine.downloadProgress.loaded)} /{" "}
                  {formatNumber(engine.downloadProgress.total)} bytes
                </p>
              </div>
            ) : null}
            {progress && engine.isSearching ? (
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono">
                <span>Eval: {progress.evaluation?.label ?? "—"}</span>
                <span>Nodes: {formatNumber(progress.stats.nodes)}</span>
                <span>NPS: {formatNumber(progress.stats.nps)}</span>
                <span>Hash: {progress.stats.hashfull ?? "—"}</span>
              </div>
            ) : null}
          </div>
        )}

        {engine.error ? (
          <ErrorAlert>
            {engine.error}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-2"
              onClick={() => void engine.initialize()}
            >
              <RotateCcw className="size-3.5" aria-hidden />
              Retry engine load
            </Button>
          </ErrorAlert>
        ) : null}

        {result ? (
          <div className="space-y-3 rounded-xl border border-line-soft bg-canvas/50 p-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted">
                  Evaluation · White perspective
                </p>
                <p className="text-2xl font-semibold text-ink">
                  {result.evaluation.label}
                </p>
              </div>
              <div className="text-right text-xs text-muted">
                <p>Depth {result.depth}</p>
                <p>{formatNumber(result.stats.nodes)} nodes</p>
              </div>
            </div>

            <div className="border-t border-line-soft pt-3">
              <p className="text-[11px] uppercase tracking-wider text-muted">
                Best move
              </p>
              {result.bestMove ? (
                <p className="font-mono text-sm text-ink">
                  {result.bestMoveSan ?? result.bestMove}{" "}
                  <span className="text-muted">({result.bestMove})</span>
                </p>
              ) : (
                <p className="text-sm text-muted">No legal best move</p>
              )}
            </div>

            {result.principalVariationSan?.length ? (
              <div className="border-t border-line-soft pt-3">
                <p className="text-[11px] uppercase tracking-wider text-muted">
                  Principal variation
                </p>
                <p className="text-sm leading-relaxed text-ink">
                  {formatPv(result.principalVariationSan)}
                </p>
                <p className="mt-1 font-mono text-[11px] text-muted">
                  {result.principalVariation?.join(" ") ?? ""}
                </p>
              </div>
            ) : null}

            <p className="border-t border-line-soft pt-3 text-[11px] text-muted">
              {result.engine?.name ?? "Stockfish"} · seldepth{" "}
              {result.stats.selectiveDepth ?? "—"} · {formatNumber(result.stats.nps)}{" "}
              nps · hash {result.stats.hashfull ?? "—"}
            </p>
          </div>
        ) : null}

        {!result && !engine.isLoading && !engine.isSearching && !engine.error ? (
          <p className="text-xs leading-relaxed text-muted">
            Choose a depth and analyze the current position. Navigation clears
            previous results, so you never see an evaluation from another
            position.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
