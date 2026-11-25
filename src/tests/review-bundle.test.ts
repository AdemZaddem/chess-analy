import { describe, expect, it } from "vitest";
import { createAnalysisSettings } from "@/lib/analysis/settings";
import {
  createBundleFromGame,
  createReviewBundle,
  MAX_BUNDLE_CHARS,
  parseReviewBundleText,
  REVIEW_BUNDLE_FORMAT,
  REVIEW_BUNDLE_VERSION,
  serializeReviewBundle,
} from "@/lib/export/review-bundle";
import type { ReviewBundleResult } from "@/lib/export/review-bundle";
import { createReviewRecord } from "@/lib/storage/schema";
import { completeAnalysis, deterministicGame } from "./phase6-test-helpers";

const settings = createAnalysisSettings("standard");

function expectError(result: ReviewBundleResult, code: string): void {
  expect(result.status).toBe("error");
  if (result.status === "error") expect(result.code).toBe(code);
}

describe("Phase 6 portable review bundles", () => {
  it("round-trips a completed analysis without rerunning the engine", async () => {
    const game = deterministicGame();
    const analysis = await completeAnalysis(game, settings);
    const bundle = createReviewBundle(
      createReviewRecord({ game, settings, analysis }),
      1_700_000_000_000,
    );
    const text = serializeReviewBundle(bundle);
    const result = parseReviewBundleText(text);

    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.game.pgn).toBe(game.pgn);
    expect(result.game.id).toBe(game.id);
    expect(result.record.analysisState).toBe("complete");
    expect(result.record.analysis?.identity.key).toBe(analysis.identity.key);
    expect(result.record.analysis?.moves).toHaveLength(game.moves.length);
    expect(result.warnings).toEqual([]);
  });

  it("exports game-only bundles and distinguishes them from share links", () => {
    const game = deterministicGame();
    const text = serializeReviewBundle(
      createBundleFromGame({ game, settings }),
    );
    const parsed = JSON.parse(text) as Record<string, unknown>;
    expect(parsed.format).toBe(REVIEW_BUNDLE_FORMAT);
    expect(parsed.version).toBe(REVIEW_BUNDLE_VERSION);
    expect((parsed.review as Record<string, unknown>).analysis).toBeNull();

    const result = parseReviewBundleText(text);
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.record.analysisState).toBe("not-started");
    }

    const share = parseReviewBundleText(JSON.stringify({ format: "other", version: 1 }));
    expectError(share, "corrupt");
    if (share.status === "error") {
      expect(share.message).toContain("not a MoveLens review file");
    }
  });

  it("rejects invalid JSON, empty files and oversized inputs", () => {
    expectError(parseReviewBundleText(""), "corrupt");
    expectError(parseReviewBundleText("{bad json"), "corrupt");
    expectError(parseReviewBundleText("x".repeat(MAX_BUNDLE_CHARS + 1)), "corrupt");
    expectError(
      parseReviewBundleText(JSON.stringify({ format: "other", version: 1 })),
      "corrupt",
    );
  });

  it("reports unsupported bundle and review schema versions clearly", async () => {
    const game = deterministicGame();
    const text = serializeReviewBundle(
      createBundleFromGame({ game, settings }),
    );

    const newerBundle = JSON.parse(text) as Record<string, unknown>;
    newerBundle.version = REVIEW_BUNDLE_VERSION + 1;
    const newerResult = parseReviewBundleText(JSON.stringify(newerBundle));
    expectError(newerResult, "unsupported-version");
    if (newerResult.status === "error") {
      expect(newerResult.message).toContain("newer format");
    }

    const newerReview = JSON.parse(text) as Record<string, unknown>;
    (newerReview.review as Record<string, unknown>).schemaVersion = 2;
    expectError(
      parseReviewBundleText(JSON.stringify(newerReview)),
      "unsupported-version",
    );
  });

  it("rejects corrupt PGN and analysis that does not match the game", async () => {
    const game = deterministicGame();
    const analysis = await completeAnalysis(game, settings);
    const text = serializeReviewBundle(
      createReviewBundle(createReviewRecord({ game, settings, analysis })),
    );

    const badPgn = JSON.parse(text) as Record<string, unknown>;
    (badPgn.review as Record<string, unknown>).game = {
      ...((badPgn.review as Record<string, unknown>).game as Record<string, unknown>),
      pgn: "not a PGN",
    };
    expectError(parseReviewBundleText(JSON.stringify(badPgn)), "corrupt");

    const badAnalysis = JSON.parse(text) as Record<string, unknown>;
    const review = badAnalysis.review as Record<string, unknown>;
    review.analysis = {
      ...(review.analysis as Record<string, unknown>),
      pgn: "1. e4 *",
    };
    expectError(parseReviewBundleText(JSON.stringify(badAnalysis)), "analysis-mismatch");
  });
});
