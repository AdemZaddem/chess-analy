import { describe, expect, it } from "vitest";
import { createAnalysisSettings } from "@/lib/analysis/settings";
import type { FullGameAnalysis } from "@/lib/analysis/types";
import {
  createReviewId,
  createReviewRecord,
  loadReview,
  normalizeStoredRecord,
  REVIEW_SCHEMA_VERSION,
  ReviewDataError,
  summarizeReview,
  withReviewId,
} from "@/lib/storage/schema";
import {
  getReviewImportConflict,
  listReviewSummaries,
  MemoryReviewStore,
  saveGameReview,
  touchReview,
  updateReviewAnalysis,
} from "@/lib/storage/review-store";
import { STANDARD_PGN } from "./fixtures";
import { completeAnalysis, deterministicGame } from "./phase6-test-helpers";

const settings = createAnalysisSettings("quick");

function expectReviewDataError(run: () => unknown, code: string): void {
  try {
    run();
    throw new Error("Expected ReviewDataError");
  } catch (error) {
    expect(error).toBeInstanceOf(ReviewDataError);
    expect((error as ReviewDataError).code).toBe(code);
  }
}

describe("Phase 6 local persistence", () => {
  it("derives stable IDs from content and a stable ID from Chess.com metadata", () => {
    const first = deterministicGame(STANDARD_PGN);
    const second = deterministicGame(STANDARD_PGN);
    expect(first.id).toBe(second.id);
    expect(createReviewId(first)).toBe(first.id);

    const changed = deterministicGame(
      STANDARD_PGN.replaceAll("1-0", "1/2-1/2"),
    );
    expect(changed.id).not.toBe(first.id);

    const chesscom = withReviewId({
      ...first,
      source: {
        kind: "chesscom",
        gameId: "123456789",
        gameType: "live",
        username: "alice",
        gameUrl: "https://www.chess.com/game/live/123456789",
      },
    });
    expect(chesscom.id).toBe("chesscom:live:123456789");
  });

  it("round-trips a completed analysis through a JSON-compatible record", async () => {
    const game = deterministicGame();
    const analysis = await completeAnalysis(game, settings);
    const record = createReviewRecord({
      game,
      settings,
      analysis,
      createdAt: 1_700_000_000_000,
    });
    const restored = normalizeStoredRecord(JSON.parse(JSON.stringify(record)));
    const loaded = loadReview(restored);

    expect(restored.schemaVersion).toBe(REVIEW_SCHEMA_VERSION);
    expect(restored.analysisState).toBe("complete");
    expect(loaded.game.id).toBe(game.id);
    expect(loaded.game.pgn).toBe(game.pgn);
    expect(loaded.warnings).toEqual([]);
    expect(loaded.record.analysis?.identity.key).toBe(analysis.identity.key);
    expect(loaded.record.analysis?.accuracy).toEqual(analysis.accuracy);

    const summary = summarizeReview(restored);
    expect(summary?.white).toBe("Alice");
    expect(summary?.black).toBe("Bob");
    expect(summary?.plyCount).toBe(game.moves.length);
    expect(summary?.whiteAccuracy).toBe(analysis.accuracy.white.accuracy);
  });

  it("keeps analysis valid when the run uses a different preset", async () => {
    const store = new MemoryReviewStore();
    const game = deterministicGame();
    const importedSettings = createAnalysisSettings("standard");
    const saved = await saveGameReview(store, { game, settings: importedSettings });
    const quickSettings = createAnalysisSettings("quick");
    const analysis = await completeAnalysis(game, quickSettings);

    await updateReviewAnalysis(store, saved.id, {
      analysisState: "complete",
      analysis,
      settings: quickSettings,
    });

    const loaded = loadReview(await store.get(saved.id));
    expect(loaded.record.settings.preset).toBe("quick");
    expect(loaded.record.analysis?.identity.key).toBe(analysis.identity.key);
    expect(loaded.warnings).toEqual([]);
  });

  it("saves, updates, lists and deletes reviews in a store", async () => {
    const store = new MemoryReviewStore();
    const game = deterministicGame();
    const saved = await saveGameReview(store, { game, settings });
    expect(saved.id).toBe(game.id);
    expect(saved.analysisState).toBe("not-started");

    const analysis = await completeAnalysis(game, settings);
    await updateReviewAnalysis(store, saved.id, {
      analysisState: "complete",
      analysis,
      lastProgress: {
        analyzedPositions: analysis.positions.length,
        totalPositions: analysis.positions.length,
        percent: 1,
      },
    });
    await touchReview(store, saved.id);

    const updated = await store.get(saved.id);
    expect(updated.analysisState).toBe("complete");
    expect(updated.analysis?.identity.key).toBe(analysis.identity.key);
    expect(updated.lastProgress?.percent).toBe(1);
    expect(updated.createdAt).toBe(saved.createdAt);

    const summaries = await listReviewSummaries(store);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.analysisState).toBe("complete");

    await store.remove(saved.id);
    expect(await listReviewSummaries(store)).toHaveLength(0);
  });

  it("rejects future schema versions and corrupt game snapshots", async () => {
    const game = deterministicGame();
    const record = await saveGameReview(new MemoryReviewStore(), {
      game,
      settings,
    });

    expectReviewDataError(
      () => normalizeStoredRecord({ ...record, schemaVersion: REVIEW_SCHEMA_VERSION + 1 }),
      "unsupported-version",
    );
    expectReviewDataError(
      () =>
        normalizeStoredRecord({
          ...record,
          game: { ...record.game, pgn: "this is not a PGN" },
        }),
      "corrupt",
    );
    expectReviewDataError(() => normalizeStoredRecord("review"), "corrupt");
  });

  it("never presents mismatched or damaged analysis as completed", async () => {
    const game = deterministicGame();
    const analysis = await completeAnalysis(game, settings);
    const record = createReviewRecord({ game, settings, analysis });

    const wrongSettings = normalizeStoredRecord({
      ...record,
      settings: createAnalysisSettings("deep"),
    });
    expect(wrongSettings.analysis).toBeNull();
    expect(wrongSettings.analysisState).toBe("incomplete");

    const tampered: FullGameAnalysis = {
      ...analysis,
      pgn: "1. e4 *",
    };
    const loaded = loadReview({ ...record, analysis: tampered });
    expect(loaded.record.analysis).toBeNull();
    expect(loaded.record.analysisState).toBe("incomplete");
    expect(loaded.warnings.join(" ")).toContain("did not match");
  });

  it("migrates unversioned legacy records without trusting derived fields", () => {
    const migrated = normalizeStoredRecord({
      game: STANDARD_PGN,
      settings,
      analysis: { fabricated: true },
      analysisState: "complete",
      createdAt: 1_600_000_000_000,
    });
    expect(migrated.schemaVersion).toBe(REVIEW_SCHEMA_VERSION);
    expect(migrated.analysis).toBeNull();
    expect(migrated.analysisState).toBe("incomplete");
    expect(migrated.game.pgn).toBe(STANDARD_PGN);
  });

  it("flags imports that would replace newer, more complete or differently configured reviews", async () => {
    const game = deterministicGame();
    const analysis = await completeAnalysis(game, settings);
    const complete = createReviewRecord({
      game,
      settings,
      analysis,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_100_000,
      lastAccessedAt: 1_700_000_200_000,
    });
    const olderGameOnly = createReviewRecord({
      game,
      settings,
      createdAt: 1_699_999_900_000,
      updatedAt: 1_699_999_950_000,
      lastAccessedAt: 1_699_999_960_000,
    });

    const conflict = getReviewImportConflict(complete, olderGameOnly);
    expect(conflict?.reasons).toContain("newer-existing");
    expect(conflict?.reasons).toContain("more-complete-existing");
    expect(conflict?.message).toContain("a completed analysis");
    expect(conflict?.message).toContain("Choose Cancel to keep the existing review.");

    const differentSettings = createReviewRecord({
      game,
      settings: createAnalysisSettings("standard"),
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_200_000,
      lastAccessedAt: 1_700_000_200_000,
    });
    const settingsConflict = getReviewImportConflict(
      createReviewRecord({
        game,
        settings,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_100_000,
        lastAccessedAt: 1_700_000_100_000,
      }),
      differentSettings,
    );
    expect(settingsConflict?.reasons).toEqual(["different-settings"]);

    const newerSameSettings = createReviewRecord({
      game,
      settings,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_300_000,
      lastAccessedAt: 1_700_000_300_000,
    });
    expect(
      getReviewImportConflict(
        createReviewRecord({
          game,
          settings,
          createdAt: 1_700_000_000_000,
          updatedAt: 1_700_000_100_000,
          lastAccessedAt: 1_700_000_100_000,
        }),
        newerSameSettings,
      ),
    ).toBeNull();
  });

  it("preserves imported provenance when a review is explicitly saved", async () => {
    const store = new MemoryReviewStore();
    const game = deterministicGame();
    const saved = await saveGameReview(store, {
      game,
      settings,
      timestamps: {
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_100_000,
        lastAccessedAt: 1_700_000_200_000,
      },
    });

    expect(saved.createdAt).toBe(1_700_000_000_000);
    expect(saved.updatedAt).toBe(1_700_000_100_000);
    expect(saved.lastAccessedAt).toBe(1_700_000_200_000);
    expect(await store.get(saved.id)).toEqual(saved);
  });
});
