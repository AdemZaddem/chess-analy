"use client";

import { useCallback, useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { ErrorAlert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { GameViewer } from "@/components/game/game-viewer";
import { SavedReviewsPanel } from "@/components/game/saved-reviews-panel";
import { ImportPanel } from "@/components/import/import-panel";
import type { FullGameAnalysisEvent } from "@/hooks/use-full-game-analysis";
import { createAnalysisSettings } from "@/lib/analysis/settings";
import type {
  AnalysisSettings,
  FullGameAnalysis,
  FullGameProgress,
} from "@/lib/analysis/types";
import type { NormalizedGame } from "@/lib/chess/types";
import type { ReviewBundleResult } from "@/lib/export/review-bundle";
import {
  REVIEW_SHARE_FRAGMENT,
  loadSharedReview,
} from "@/lib/share/review-share";
import {
  createReviewId,
  createReviewRecord,
  loadReview,
  withReviewId,
  type ReviewAnalysisState,
  type StoredReviewRecord,
} from "@/lib/storage/schema";
import {
  describeStorageError,
  getExistingReviewConflict,
  getReviewStore,
  listReviewSummaries,
  saveGameReview,
  touchReview,
  updateReviewAnalysis,
  type ReviewStore,
} from "@/lib/storage/review-store";
import type { ReviewSummary } from "@/lib/storage/schema";

type ImportedBundle = Extract<ReviewBundleResult, { status: "success" }>;

interface ActiveReview {
  game: NormalizedGame;
  settings: AnalysisSettings;
  analysis: FullGameAnalysis | null;
  analysisState: ReviewAnalysisState;
}

interface Feedback {
  tone: "info" | "success" | "error";
  message: string;
}

function progressSnapshot(progress: FullGameProgress | null) {
  if (!progress) return undefined;
  return {
    analyzedPositions: progress.analyzedPositions,
    totalPositions: progress.totalPositions,
    percent: progress.percent,
  };
}

function messageOf(error: unknown, fallback: string): string {
  return describeStorageError(error) || fallback;
}

export function AnalysisWorkspace({
  store = getReviewStore(),
}: {
  store?: ReviewStore;
}) {
  const [active, setActive] = useState<ActiveReview | null>(null);
  const [view, setView] = useState<"game" | "import" | "saved">("import");
  const [summaries, setSummaries] = useState<ReviewSummary[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [loadingShare, setLoadingShare] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const refreshSaved = useCallback(async () => {
    try {
      setSummaries(await listReviewSummaries(store));
    } catch (error) {
      setFeedback({
        tone: "error",
        message: messageOf(error, "Could not load saved reviews."),
      });
    }
  }, [store]);

  const activate = useCallback(
    async (
      next: ActiveReview,
      successMessage: string,
      importedRecord?: StoredReviewRecord,
    ) => {
      // Imported games start with a random parser ID; normalize it before both
      // persistence and analysis so restored snapshots keep a matching identity.
      const reviewGame = withReviewId(next.game);
      const timestamps = importedRecord
        ? {
            createdAt: importedRecord.createdAt,
            updatedAt: importedRecord.updatedAt,
            lastAccessedAt: importedRecord.lastAccessedAt,
          }
        : undefined;
      const candidate = createReviewRecord({
        game: reviewGame,
        settings: next.settings,
        analysis: next.analysis,
        analysisState: next.analysisState,
        lastProgress: importedRecord?.lastProgress,
        ...(timestamps ?? {}),
      });

      let saveError: string | null = null;
      let cancelled = false;
      try {
        const conflict = await getExistingReviewConflict(store, candidate);
        if (
          conflict &&
          !(
            typeof window !== "undefined" &&
            typeof window.confirm === "function" &&
            window.confirm(conflict.message)
          )
        ) {
          cancelled = true;
        }
        if (!cancelled) {
          await saveGameReview(store, {
            game: reviewGame,
            settings: next.settings,
            analysis: next.analysis,
            analysisState: next.analysisState,
            lastProgress: importedRecord?.lastProgress,
            ...(timestamps ? { timestamps } : {}),
          });
        }
      } catch (error) {
        saveError = messageOf(error, "Could not save this game locally.");
      }

      if (cancelled) {
        setFeedback({
          tone: "info",
          message: "Import cancelled. The existing saved review was kept.",
        });
        return;
      }
      setActive({ ...next, game: reviewGame });
      setView("game");
      setFeedback(
        saveError
          ? { tone: "error", message: `${successMessage} ${saveError}` }
          : { tone: "success", message: successMessage },
      );
      void refreshSaved();
    },
    [refreshSaved, store],
  );

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      setLoadingSaved(true);
      await refreshSaved();
      if (!cancelled) setLoadingSaved(false);

      const hash = window.location.hash;
      if (!hash.startsWith(`#${REVIEW_SHARE_FRAGMENT}=`)) return;
      setLoadingShare(true);
      try {
        const shared = await loadSharedReview(hash);
        if (cancelled) return;
        await activate(
          {
            game: shared.game,
            settings: shared.settings,
            analysis: null,
            analysisState: "not-started",
          },
          "Shared game loaded locally. Run the analysis when you are ready.",
        );
      } catch (error) {
        if (!cancelled) {
          setFeedback({
            tone: "error",
            message:
              error instanceof Error
                ? error.message
                : "This share link could not be opened.",
          });
        }
      } finally {
        if (!cancelled) setLoadingShare(false);
      }
    }
    void initialize();
    return () => {
      cancelled = true;
    };
  }, [activate, refreshSaved]);

  const clearShareHash = useCallback(() => {
    if (typeof window === "undefined" || !window.location.hash) return;
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
  }, []);

  const handleImport = useCallback(
    (game: NormalizedGame) => {
      void activate(
        {
          game,
          settings: createAnalysisSettings("standard"),
          analysis: null,
          analysisState: "not-started",
        },
        "Game imported and saved in this browser.",
      );
    },
    [activate],
  );

  const handleBundle = useCallback(
    (bundle: ImportedBundle) => {
      void activate(
        {
          game: bundle.game,
          settings: bundle.record.settings,
          analysis: bundle.record.analysis,
          analysisState: bundle.record.analysisState,
        },
        bundle.warnings.length
          ? `Review file imported. ${bundle.warnings.join(" ")}`
          : bundle.record.analysis
            ? "Review imported with its completed analysis."
            : "Game imported from review file and saved locally.",
        bundle.record,
      );
    },
    [activate],
  );

  const handleOpenSaved = useCallback(
    async (id: string) => {
      try {
        const record = await store.get(id);
        const loaded = loadReview(record);
        await touchReview(store, record.id);
        setActive({
          game: loaded.game,
          settings: record.settings,
          analysis: loaded.record.analysis,
          analysisState: loaded.record.analysisState,
        });
        setView("game");
        setFeedback(
          loaded.warnings.length
            ? { tone: "error", message: loaded.warnings.join(" ") }
            : {
                tone: "success",
                message: record.analysis
                  ? "Saved review restored without rerunning analysis."
                  : "Saved game restored. Analysis is ready to run.",
              },
        );
        void refreshSaved();
      } catch (error) {
        setFeedback({
          tone: "error",
          message: messageOf(error, "This saved game could not be opened."),
        });
      }
    },
    [refreshSaved, store],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (
        typeof window !== "undefined" &&
        !window.confirm("Delete this saved game and its analysis from this browser?")
      ) {
        return;
      }
      try {
        await store.remove(id);
        if (active && createReviewId(active.game) === id) setActive(null);
        setFeedback({ tone: "success", message: "Saved game deleted." });
        await refreshSaved();
      } catch (error) {
        setFeedback({
          tone: "error",
          message: messageOf(error, "Could not delete this saved game."),
        });
      }
    },
    [active, refreshSaved, store],
  );

  const handleClear = useCallback(async () => {
    try {
      await store.clear();
      setActive(null);
      setSummaries([]);
      clearShareHash();
      setFeedback({
        tone: "success",
        message: "All locally saved games and analyses were deleted.",
      });
      await refreshSaved();
    } catch (error) {
      setFeedback({
        tone: "error",
        message: messageOf(error, "Could not clear saved games."),
      });
    }
  }, [clearShareHash, refreshSaved, store]);

  const handleAnalysisEvent = useCallback(
    (event: FullGameAnalysisEvent) => {
      if (!active) return;
      const id = createReviewId(active.game);
      void (async () => {
        try {
          if (event.type === "start") {
            // The user may have changed preset after import; persist the
            // settings that actually produced this run so restore can validate
            // the analysis identity later.
            await updateReviewAnalysis(store, id, {
              analysisState: "running",
              analysis: null,
              settings: event.settings,
            });
            return;
          }
          if (event.type === "complete") {
            await updateReviewAnalysis(store, id, {
              analysisState: "complete",
              analysis: event.analysis,
              settings: event.analysis.settings,
              lastProgress: {
                analyzedPositions: event.analysis.positions.length,
                totalPositions: event.analysis.positions.length,
                percent: 1,
              },
            });
            setActive((current) =>
              current
                ? {
                    ...current,
                    analysis: event.analysis,
                    analysisState: "complete",
                    settings: event.analysis.settings,
                  }
                : current,
            );
          } else if (event.type === "cancelled" || event.type === "error") {
            await updateReviewAnalysis(store, id, {
              analysisState: "incomplete",
              lastProgress: progressSnapshot(event.progress),
            });
            setActive((current) =>
              current ? { ...current, analysisState: "incomplete" } : current,
            );
          } else {
            return;
          }
          await refreshSaved();
        } catch (error) {
          setFeedback({
            tone: "error",
            message: messageOf(error, "Could not update the saved review."),
          });
        }
      })();
    },
    [active, refreshSaved, store],
  );

  return (
    <div className="space-y-4">
      {feedback ? (
        <div className="mx-auto w-full max-w-3xl">
          {feedback.tone === "error" ? (
            <ErrorAlert>{feedback.message}</ErrorAlert>
          ) : (
            <p
              role="status"
              className="rounded-xl border border-accent/25 bg-accent/10 px-4 py-2.5 text-sm text-ink"
            >
              {feedback.message}
            </p>
          )}
        </div>
      ) : null}

      {loadingShare ? (
        <p
          role="status"
          className="mx-auto flex w-full max-w-3xl items-center gap-2 rounded-xl border border-line bg-surface/60 px-4 py-3 text-sm text-muted"
        >
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          Opening shared review…
        </p>
      ) : null}

      {active && view === "game" ? (
        <GameViewer
          key={active.game.id}
          game={active.game}
          initialPreset={
            active.settings.preset === "custom" ? "standard" : active.settings.preset
          }
          initialAnalysis={active.analysis}
          restoredState={active.analysisState}
          onAnalysisEvent={handleAnalysisEvent}
          onReset={() => {
            clearShareHash();
            setActive(null);
            setView("import");
          }}
          onImportAnother={() => setView("import")}
          onOpenSaved={() => setView("saved")}
        />
      ) : null}

      {view === "saved" ? (
        <>
          {active ? (
            <div className="mx-auto flex w-full max-w-3xl justify-end">
              <Button variant="ghost" size="sm" onClick={() => setView("game")}>
                Back to game
              </Button>
            </div>
          ) : null}
          <SavedReviewsPanel
            summaries={summaries}
            loading={loadingSaved}
            error={null}
            onOpen={(id) => void handleOpenSaved(id)}
            onDelete={(id) => void handleDelete(id)}
            onClear={() => void handleClear()}
            onImport={() => setView("import")}
          />
        </>
      ) : null}

      {view === "import" ? (
        <>
          {summaries.length > 0 ? (
            <div className="mx-auto flex w-full max-w-3xl justify-end">
              <Button variant="ghost" size="sm" onClick={() => setView("saved")}>
                My reviews ({summaries.length})
              </Button>
            </div>
          ) : null}
          <ImportPanel
            onImport={handleImport}
            onImportBundle={handleBundle}
            onCancel={active ? () => setView("game") : undefined}
          />
        </>
      ) : null}
    </div>
  );
}
