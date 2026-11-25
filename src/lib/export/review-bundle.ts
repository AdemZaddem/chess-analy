/**
 * Portable review files. Unlike a share link, a bundle can carry a previously
 * completed analysis snapshot; both formats are validated before being used.
 */
import type { FullGameAnalysis } from "@/lib/analysis/types";
import type { NormalizedGame } from "@/lib/chess/types";
import {
  createReviewRecord,
  loadReview,
  normalizeStoredRecord,
  REVIEW_SCHEMA_VERSION,
  withReviewId,
  type StoredReviewRecord,
} from "@/lib/storage/schema";

export const REVIEW_BUNDLE_FORMAT = "movelens-review";
export const REVIEW_BUNDLE_VERSION = 1;
export const MAX_BUNDLE_CHARS = 20_000_000;

export interface ReviewBundle {
  format: typeof REVIEW_BUNDLE_FORMAT;
  version: typeof REVIEW_BUNDLE_VERSION;
  exportedAt: number;
  review: StoredReviewRecord;
}

export type ReviewBundleErrorCode =
  | "corrupt"
  | "unsupported-version"
  | "analysis-mismatch";

export type ReviewBundleResult =
  | {
      status: "success";
      record: StoredReviewRecord;
      game: NormalizedGame;
      warnings: string[];
    }
  | {
      status: "error";
      code: ReviewBundleErrorCode;
      message: string;
    };

export function createReviewBundle(
  record: StoredReviewRecord,
  exportedAt = Date.now(),
): ReviewBundle {
  return {
    format: REVIEW_BUNDLE_FORMAT,
    version: REVIEW_BUNDLE_VERSION,
    exportedAt,
    review: normalizeStoredRecord(record),
  };
}

export function createBundleFromGame(options: {
  game: NormalizedGame;
  settings: StoredReviewRecord["settings"];
  analysis?: FullGameAnalysis | null;
}): ReviewBundle {
  return createReviewBundle(
    createReviewRecord({
      game: withReviewId(options.game),
      settings: options.settings,
      analysis: options.analysis ?? null,
      analysisState: options.analysis ? "complete" : "not-started",
    }),
  );
}

export function serializeReviewBundle(bundle: ReviewBundle): string {
  return JSON.stringify(createReviewBundle(bundle.review, bundle.exportedAt), null, 2);
}

export function parseReviewBundleText(text: string): ReviewBundleResult {
  if (!text.trim()) {
    return { status: "error", code: "corrupt", message: "The review file is empty." };
  }
  if (text.length > MAX_BUNDLE_CHARS) {
    return {
      status: "error",
      code: "corrupt",
      message: "This review file is too large to load.",
    };
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return {
      status: "error",
      code: "corrupt",
      message: "This file is not valid JSON. Choose a Movelens review export.",
    };
  }
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    (value as Record<string, unknown>).format !== REVIEW_BUNDLE_FORMAT
  ) {
    return {
      status: "error",
      code: "corrupt",
      message: "This is not a Movelens review file.",
    };
  }
  const version = (value as Record<string, unknown>).version;
  if (version !== REVIEW_BUNDLE_VERSION) {
    return {
      status: "error",
      code: "unsupported-version",
      message:
        typeof version === "number" && version > REVIEW_BUNDLE_VERSION
          ? `This review file uses a newer format (v${version}). Update the app and try again.`
          : `This review file uses an unsupported format (v${String(version)}).`,
    };
  }

  const rawReview = (value as Record<string, unknown>).review;
  let record: StoredReviewRecord;
  try {
    record = normalizeStoredRecord(rawReview);
  } catch (error) {
    return {
      status: "error",
      code: error instanceof Error && error.name === "ReviewDataError"
        ? (error as Error & { code?: ReviewBundleErrorCode }).code ?? "corrupt"
        : "corrupt",
      message: error instanceof Error ? error.message : "The review file is damaged.",
    };
  }
  if (record.schemaVersion !== REVIEW_SCHEMA_VERSION) {
    return {
      status: "error",
      code: "unsupported-version",
      message: "This review file uses an unsupported storage schema.",
    };
  }

  let loaded;
  try {
    loaded = loadReview(record);
  } catch (error) {
    return {
      status: "error",
      code: "corrupt",
      message: error instanceof Error ? error.message : "The review PGN could not be restored.",
    };
  }
  const hadAnalysis =
    typeof rawReview === "object" &&
    rawReview !== null &&
    !Array.isArray(rawReview) &&
    (rawReview as Record<string, unknown>).analysis !== null &&
    (rawReview as Record<string, unknown>).analysis !== undefined;
  if (hadAnalysis && !loaded.record.analysis) {
    return {
      status: "error",
      code: "analysis-mismatch",
      message: "The analysis in this file does not match its game or settings.",
    };
  }
  return {
    status: "success",
    record: loaded.record,
    game: loaded.game,
    warnings: loaded.warnings,
  };
}
