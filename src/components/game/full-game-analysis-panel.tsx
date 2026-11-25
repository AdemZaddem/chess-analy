"use client";

import {
  Activity,
  AlertTriangle,
  BarChart3,
  Loader2,
  Play,
  RotateCcw,
  Square,
} from "lucide-react";
import { ErrorAlert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MoveInspector } from "@/components/review/move-inspector";
import {
  ANALYSIS_PRESETS,
  type SelectablePreset,
} from "@/lib/analysis/settings";
import type { AnalysisSettings } from "@/lib/analysis/types";
import type { UseFullGameAnalysisResult } from "@/hooks/use-full-game-analysis";

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function FullGameAnalysisPanel({
  settings,
  preset,
  onPresetChange,
  selectedPly,
  analysis,
}: {
  settings: AnalysisSettings;
  preset: SelectablePreset;
  onPresetChange: (preset: SelectablePreset) => void;
  selectedPly: number;
  analysis: UseFullGameAnalysisResult;
}) {
  const { progress, result } = analysis;
  const selectedMove = result?.moves.find((move) => move.ply === selectedPly);
  const percent = progress ? Math.round(progress.percent * 100) : 0;

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3 p-4">
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="size-4 text-accent" aria-hidden />
          Full game review
        </CardTitle>
        <Badge variant={result ? "success" : analysis.isRunning ? "violet" : "neutral"}>
          {result
            ? "Complete"
            : analysis.isRunning
              ? "Analyzing"
              : "Not started"}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-4 p-4">
        <p className="flex gap-2 rounded-lg border border-amber-400/20 bg-amber-400/10 p-2.5 text-xs leading-relaxed text-amber-100/90">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            Deeper analysis examines more positions and takes longer. Timing
            depends on your hardware and search conditions; results may differ
            between devices.
          </span>
        </p>

        <div className="space-y-2">
          <span className="text-[11px] uppercase tracking-wider text-muted">
            Analysis depth
          </span>
          <div role="group" aria-label="Full game analysis depth" className="flex flex-wrap gap-2">
            {(Object.keys(ANALYSIS_PRESETS) as SelectablePreset[]).map((key) => (
              <Button
                key={key}
                type="button"
                variant={preset === key ? "primary" : "secondary"}
                size="sm"
                aria-pressed={preset === key}
                disabled={analysis.isRunning}
                onClick={() => onPresetChange(key)}
              >
                {ANALYSIS_PRESETS[key].label} · {ANALYSIS_PRESETS[key].depth}
              </Button>
            ))}
          </div>
          <p className="text-[11px] text-muted">
            MultiPV 1 · {settings.depth} plies per position · engine WDL with
            centipawn fallback
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => void analysis.analyze()}
            disabled={analysis.isRunning}
          >
            {analysis.isRunning ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Play className="size-4" aria-hidden />
            )}
            {result ? "Analyze again" : "Analyze full game"}
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={() => void analysis.cancel()}
            disabled={!analysis.isRunning}
          >
            <Square className="size-3.5" aria-hidden />
            Cancel analysis
          </Button>
        </div>

        {analysis.isRunning && progress ? (
          <div
            role="status"
            aria-live="polite"
            className="space-y-2 rounded-xl border border-line-soft bg-surface-2/60 p-3 text-xs text-muted"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-ink">
                <Activity className="size-3.5 text-accent" aria-hidden />
                {progress.message ?? "Analyzing positions…"}
              </span>
              <span>{percent}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-accent transition-[width]"
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono">
              <span>
                Positions: {progress.analyzedPositions}/{progress.totalPositions}
              </span>
              <span>Ply: {progress.currentPly}</span>
              <span>Elapsed: {formatDuration(progress.elapsedMs)}</span>
              <span>
                {progress.downloadPercent !== undefined
                  ? `Engine: ${Math.round(progress.downloadPercent * 100)}%`
                  : progress.engineName ?? "Engine ready"}
              </span>
            </div>
          </div>
        ) : null}

        {analysis.error ? (
          <ErrorAlert>
            {analysis.error}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-2"
              onClick={() => void analysis.analyze()}
            >
              <RotateCcw className="size-3.5" aria-hidden />
              Retry analysis
            </Button>
          </ErrorAlert>
        ) : null}

        {result ? (
          <div className="space-y-3 rounded-xl border border-line-soft bg-canvas/50 p-3">
            <p className="text-[11px] text-muted">
              {result.moves.length} moves · {result.positions.length} positions ·{" "}
              {result.settings.depth} depth · {formatDuration(result.durationMs)}
            </p>

            {result.warnings.map((warning) => (
              <p
                key={warning}
                className="rounded-lg border border-amber-400/20 bg-amber-400/10 p-2 text-[11px] leading-relaxed text-amber-100/90"
              >
                {warning}
              </p>
            ))}

            <MoveInspector move={selectedMove} />
          </div>
        ) : null}

        {!result && !analysis.isRunning && !analysis.error ? (
          <p className="text-xs leading-relaxed text-muted">
            Full-game analysis is never started automatically. Import a game,
            choose a depth, then start the review explicitly.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
