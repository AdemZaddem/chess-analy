"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CLASSIFICATION_LABELS, type ClassificationTone } from "@/lib/analysis/labels";
import {
  EVAL_SATURATION_LIMIT,
  type GraphPoint,
} from "@/lib/review/evaluation";

const WIDTH = 800;
const HEIGHT = 240;
const PAD = { left: 38, right: 14, top: 16, bottom: 28 };
const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;

const toneColors: Record<ClassificationTone, string> = {
  neutral: "#94a89c",
  success: "#34d399",
  violet: "#a78bfa",
  warning: "#fbbf24",
};

function xFor(ply: number, min: number, max: number): number {
  if (max <= min) return PAD.left + PLOT_W / 2;
  return PAD.left + ((ply - min) / (max - min)) * PLOT_W;
}

function yFor(plotValue: number): number {
  const bounded = Math.min(EVAL_SATURATION_LIMIT, Math.max(-EVAL_SATURATION_LIMIT, plotValue));
  return PAD.top + ((EVAL_SATURATION_LIMIT - bounded) / (2 * EVAL_SATURATION_LIMIT)) * PLOT_H;
}

export function EvaluationGraph({
  points,
  selectedPly,
  onSelectPly,
  className,
}: {
  points: GraphPoint[];
  selectedPly: number;
  onSelectPly: (ply: number) => void;
  className?: string;
}) {
  const [hoverPly, setHoverPly] = useState<number | null>(null);

  const layout = useMemo(() => {
    const minPly = points[0]?.ply ?? 0;
    const maxPly = points[points.length - 1]?.ply ?? minPly;
    const positioned = points.map((point) => ({
      point,
      x: xFor(point.ply, minPly, maxPly),
      y: yFor(point.plotValue),
    }));
    const centerY = yFor(0);
    return { positioned, centerY, minPly, maxPly };
  }, [points]);

  const active = hoverPly === null
    ? points.find((point) => point.ply === selectedPly)
    : points.find((point) => point.ply === hoverPly);
  const path = layout.positioned
    .map(({ x, y }, index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");

  return (
    <Card className={className}>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2 py-3">
        <CardTitle className="text-sm">Evaluation</CardTitle>
        <p className="font-mono text-xs text-muted" aria-live="polite">
          {active
            ? `Ply ${active.ply} · ${active.isMate ? active.label : `${active.label} White`}`
            : "No evaluation yet"}
        </p>
      </CardHeader>
      <CardContent className="p-3 sm:p-4">
        {points.length === 0 ? (
          <p className="px-2 py-10 text-center text-xs text-muted">
            Analyze the full game to see its evaluation swings.
          </p>
        ) : (
          <>
            <svg
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              className="h-44 w-full sm:h-56"
              aria-label={`Evaluation graph, ${points.length} positions, White above the centre line`}
            >
              {[EVAL_SATURATION_LIMIT, 5, 0, -5, -EVAL_SATURATION_LIMIT].map((value) => (
                <g key={value}>
                  <line
                    x1={PAD.left}
                    x2={WIDTH - PAD.right}
                    y1={yFor(value)}
                    y2={yFor(value)}
                    stroke={value === 0 ? "#4b6357" : "#23342b"}
                    strokeWidth={value === 0 ? 1.5 : 1}
                    strokeDasharray={value === 0 ? undefined : "3 5"}
                  />
                  <text x={PAD.left - 8} y={yFor(value) + 4} textAnchor="end" className="fill-muted text-[10px]">
                    {value > 0 ? `+${value}` : value}
                  </text>
                </g>
              ))}

              {layout.positioned.map(({ point, x, y }) => (
                <rect
                  key={`bar-${point.ply}`}
                  x={x - 1.5}
                  y={Math.min(y, layout.centerY)}
                  width={3}
                  height={Math.max(1, Math.abs(y - layout.centerY))}
                  fill={point.plotValue >= 0 ? "#34d399" : "#a78bfa"}
                  opacity={point.hasEvaluation ? 0.22 : 0.06}
                />
              ))}

              <path d={path} fill="none" stroke="#dce9df" strokeWidth={2} strokeLinejoin="round" />

              {layout.positioned.map(({ point, x, y }) => {
                const selected = point.ply === selectedPly;
                const tone = point.classification
                  ? toneColors[CLASSIFICATION_LABELS[point.classification].tone]
                  : "#e9f1ec";
                const meta = point.classification
                  ? CLASSIFICATION_LABELS[point.classification]
                  : undefined;
                const label = `Ply ${point.ply}${point.san ? ` ${point.san}` : ""}, ${point.isMate ? `mate ${point.label}` : `${point.label} White`}${meta ? `, ${meta.label}` : ""}`;
                return (
                  <g
                    key={`point-${point.ply}`}
                    role="button"
                    tabIndex={0}
                    aria-label={label}
                    aria-pressed={selected}
                    data-ply={point.ply}
                    className="cursor-pointer focus:outline-none"
                    onClick={() => onSelectPly(point.ply)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelectPly(point.ply);
                      }
                    }}
                    onMouseEnter={() => setHoverPly(point.ply)}
                    onMouseLeave={() => setHoverPly(null)}
                    onFocus={() => setHoverPly(point.ply)}
                    onBlur={() => setHoverPly(null)}
                  >
                    <circle cx={x} cy={y} r={11} fill="transparent" />
                    {point.isMate ? (
                      <rect
                        x={x - 4}
                        y={y - 4}
                        width={8}
                        height={8}
                        transform={`rotate(45 ${x} ${y})`}
                        fill={tone}
                        stroke="#080d0b"
                        strokeWidth={1}
                      />
                    ) : (
                      <circle
                        cx={x}
                        cy={y}
                        r={selected ? 5.5 : 3.5}
                        fill={point.hasEvaluation ? tone : "#27382f"}
                        stroke={selected ? "#f8fafc" : "#080d0b"}
                        strokeWidth={selected ? 2 : 1}
                        opacity={point.uncertain && !point.isMate ? 0.65 : 1}
                      />
                    )}
                    {selected ? (
                      <line
                        x1={x}
                        x2={x}
                        y1={PAD.top}
                        y2={HEIGHT - PAD.bottom}
                        stroke="#f8fafc"
                        strokeOpacity={0.35}
                        strokeDasharray="2 4"
                      />
                    ) : null}
                  </g>
                );
              })}

              {[0, 5, 10, 15, 20, 25, 30].map((ply) => {
                if (ply > layout.maxPly) return null;
                const x = xFor(ply, layout.minPly, layout.maxPly);
                return (
                  <text key={`label-${ply}`} x={x} y={HEIGHT - 8} textAnchor="middle" className="fill-muted text-[10px]">
                    {ply === 0 ? "start" : `${Math.ceil(ply / 2)}.`}
                  </text>
                );
              })}
            </svg>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted">
              <span><span className="text-accent">■</span> White advantage</span>
              <span><span className="text-violet">■</span> Black advantage</span>
              <span>◆ mate</span>
              <span>Lines saturate beyond ±{EVAL_SATURATION_LIMIT} pawns.</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
