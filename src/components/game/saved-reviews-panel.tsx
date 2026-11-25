"use client";

import { useState } from "react";
import { Clock3, FolderOpen, LoaderCircle, Trash2 } from "lucide-react";
import { ErrorAlert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ReviewAnalysisState, ReviewSummary } from "@/lib/storage/schema";

const stateLabels: Record<ReviewAnalysisState, string> = {
  "not-started": "Not analyzed",
  running: "Interrupted",
  incomplete: "Incomplete",
  complete: "Reviewed",
};

function stateVariant(state: ReviewAnalysisState): "success" | "warning" | "neutral" {
  if (state === "complete") return "success";
  if (state === "running" || state === "incomplete") return "warning";
  return "neutral";
}

function formatTimestamp(value: number): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function SavedReviewsPanel({
  summaries,
  loading,
  error,
  onOpen,
  onDelete,
  onClear,
  onImport,
}: {
  summaries: ReviewSummary[];
  loading: boolean;
  error: string | null;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
  onImport: () => void;
}) {
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <Card className="mx-auto w-full max-w-3xl" data-testid="saved-reviews">
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="size-4 text-accent" aria-hidden />
            My reviews
          </CardTitle>
          <p className="mt-1 text-xs text-muted">
            Saved only in this browser. Clearing browser data removes them.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="neutral">{summaries.length} saved</Badge>
          <Button variant="secondary" size="sm" onClick={onImport}>
            Import a game
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="flex items-center gap-2 py-8 text-sm text-muted" role="status">
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            Loading saved games…
          </p>
        ) : summaries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center">
            <p className="text-sm font-medium text-ink">No saved reviews yet</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Import a PGN or Chess.com game to start. It is saved automatically
              in this browser.
            </p>
            <Button variant="primary" size="sm" className="mt-4" onClick={onImport}>
              Import your first game
            </Button>
          </div>
        ) : (
          <ul className="space-y-2" data-testid="saved-review-list">
            {summaries.map((summary) => (
              <li
                key={summary.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line-soft bg-surface-2/50 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {summary.white} vs {summary.black}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
                    <span>{summary.result}</span>
                    {summary.date ? <span>{summary.date}</span> : null}
                    <span>{summary.plyCount} plies</span>
                    {formatTimestamp(summary.lastAccessedAt) ? (
                      <span className="flex items-center gap-1">
                        <Clock3 className="size-3" aria-hidden />
                        Opened {formatTimestamp(summary.lastAccessedAt)}
                      </span>
                    ) : null}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={stateVariant(summary.analysisState)}>
                    {stateLabels[summary.analysisState]}
                  </Badge>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onOpen(summary.id)}
                    data-testid={`open-review-${summary.id}`}
                  >
                    Open
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Delete saved game ${summary.white} versus ${summary.black}`}
                    onClick={() => onDelete(summary.id)}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {error ? <ErrorAlert>{error}</ErrorAlert> : null}

        {summaries.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-3">
            <p className="text-[11px] text-muted">
              Export a review before clearing storage if you want to keep it.
            </p>
            {confirmClear ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-red-200">Delete all saved games?</span>
                <Button variant="danger" size="sm" onClick={onClear}>
                  Yes, clear all
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmClear(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button variant="danger" size="sm" onClick={() => setConfirmClear(true)}>
                Clear all saved games
              </Button>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
