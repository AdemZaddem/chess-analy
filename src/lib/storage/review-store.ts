/** Browser-native review persistence. No third-party database dependency. */
import type { FullGameAnalysis } from "@/lib/analysis/types";
import type { NormalizedGame } from "@/lib/chess/types";
import {
  createReviewId,
  createReviewRecord,
  normalizeStoredRecord,
  type ReviewAnalysisState,
  type ReviewProgressSnapshot,
  type StoredReviewRecord,
  type ReviewSummary,
} from "./schema";
import { summarizeReview } from "./schema";

const DATABASE_NAME = "movelens";
const DATABASE_VERSION = 1;
const STORE_NAME = "reviews";

export type ReviewStorageErrorCode =
  | "unavailable"
  | "quota"
  | "corrupt"
  | "unsupported-version"
  | "write-failed";

export class ReviewStorageError extends Error {
  readonly code: ReviewStorageErrorCode;

  constructor(code: ReviewStorageErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ReviewStorageError";
    this.code = code;
  }
}

export interface ReviewStore {
  list(): Promise<StoredReviewRecord[]>;
  get(id: string): Promise<StoredReviewRecord>;
  save(record: StoredReviewRecord): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}

function toStorageError(error: unknown, fallback: string): ReviewStorageError {
  if (error instanceof ReviewStorageError) return error;
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    if (
      error.name === "QuotaExceededError" ||
      error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      error.code === 22
    ) {
      return new ReviewStorageError(
        "quota",
        "Browser storage is full. Export the review or remove old saved games to free space.",
        { cause: error },
      );
    }
  }
  if (error instanceof Error && /quota|storage full/i.test(error.message)) {
    return new ReviewStorageError("quota", error.message, { cause: error });
  }
  if (error instanceof Error && error.name === "ReviewDataError") {
    const code = (error as Error & { code?: string }).code;
    return new ReviewStorageError(
      code === "unsupported-version" ? "unsupported-version" : "corrupt",
      error.message,
      { cause: error },
    );
  }
  return new ReviewStorageError("write-failed", fallback, { cause: error });
}

export function describeStorageError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Local storage is unavailable in this browser.";
}

/** In-memory implementation used by tests and as a last-resort UI fallback. */
export class MemoryReviewStore implements ReviewStore {
  private readonly records = new Map<string, StoredReviewRecord>();

  async list(): Promise<StoredReviewRecord[]> {
    return [...this.records.values()]
      .map((record) => normalizeStoredRecord(record))
      .sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);
  }

  async get(id: string): Promise<StoredReviewRecord> {
    const record = this.records.get(id);
    if (!record) throw new ReviewStorageError("corrupt", "Saved game not found.");
    return normalizeStoredRecord(record);
  }

  async save(record: StoredReviewRecord): Promise<void> {
    const normalized = normalizeStoredRecord(record);
    this.records.set(normalized.id, structuredCloneLike(normalized));
  }

  async remove(id: string): Promise<void> {
    this.records.delete(id);
  }

  async clear(): Promise<void> {
    this.records.clear();
  }
}

function structuredCloneLike<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class IndexedDBReviewStore implements ReviewStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    if (typeof indexedDB === "undefined") {
      return Promise.reject(
        new ReviewStorageError(
          "unavailable",
          "IndexedDB is unavailable. Saved reviews need browser storage to be enabled.",
        ),
      );
    }

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(
          new ReviewStorageError(
            "unavailable",
            "Could not open local review storage. Check browser privacy settings.",
            { cause: request.error },
          ),
        );
      request.onblocked = () =>
        reject(
          new ReviewStorageError(
            "unavailable",
            "Local review storage is blocked by another open tab. Close other tabs and retry.",
          ),
        );
    }).catch((error: unknown) => {
      this.dbPromise = null;
      throw error;
    });
    return this.dbPromise;
  }

  private request<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>,
    fallback: string,
  ): Promise<T> {
    return this.open().then(
      (database) =>
        new Promise<T>((resolve, reject) => {
          let result: T;
          let transaction: IDBTransaction;
          try {
            transaction = database.transaction(STORE_NAME, mode);
            const request = run(transaction.objectStore(STORE_NAME));
            request.onsuccess = () => {
              result = request.result;
            };
            transaction.oncomplete = () => resolve(result);
            transaction.onerror = () =>
              reject(toStorageError(transaction.error, fallback));
            transaction.onabort = () =>
              reject(toStorageError(transaction.error, fallback));
          } catch (error) {
            reject(toStorageError(error, fallback));
          }
        }),
    );
  }

  async list(): Promise<StoredReviewRecord[]> {
    const records = await this.request<unknown[]>(
      "readonly",
      (store) => store.getAll(),
      "Could not read saved reviews.",
    );
    const valid: StoredReviewRecord[] = [];
    for (const raw of records) {
      try {
        valid.push(normalizeStoredRecord(raw));
      } catch {
        // One damaged record must not hide the rest of the library.
      }
    }
    return valid.sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);
  }

  async get(id: string): Promise<StoredReviewRecord> {
    const raw = await this.request<unknown>(
      "readonly",
      (store) => store.get(id),
      "Could not read the saved game.",
    );
    if (raw === undefined) {
      throw new ReviewStorageError("corrupt", "Saved game not found.");
    }
    try {
      return normalizeStoredRecord(raw);
    } catch (error) {
      throw toStorageError(error, "The saved game could not be validated.");
    }
  }

  async save(record: StoredReviewRecord): Promise<void> {
    const normalized = normalizeStoredRecord(record);
    await this.request(
      "readwrite",
      (store) => store.put(normalized),
      "Could not save this review.",
    );
  }

  async remove(id: string): Promise<void> {
    await this.request(
      "readwrite",
      (store) => store.delete(id),
      "Could not delete this saved game.",
    );
  }

  async clear(): Promise<void> {
    await this.request(
      "readwrite",
      (store) => store.clear(),
      "Could not clear saved games.",
    );
  }
}

let browserStore: ReviewStore | null = null;

export function getReviewStore(): ReviewStore {
  browserStore ??= new IndexedDBReviewStore();
  return browserStore;
}

export async function listReviewSummaries(
  store: ReviewStore,
): Promise<ReviewSummary[]> {
  const records = await store.list();
  return records
    .map((record) => summarizeReview(record))
    .filter((summary): summary is ReviewSummary => summary !== null);
}

export async function saveGameReview(
  store: ReviewStore,
  options: {
    game: NormalizedGame;
    settings: StoredReviewRecord["settings"];
    analysis?: FullGameAnalysis | null;
    analysisState?: ReviewAnalysisState;
    lastProgress?: ReviewProgressSnapshot;
  },
): Promise<StoredReviewRecord> {
  const id = createReviewId(options.game);
  let existing: StoredReviewRecord | null = null;
  try {
    existing = await store.get(id);
  } catch (error) {
    if (!(error instanceof ReviewStorageError) || error.code !== "corrupt") {
      throw error;
    }
  }

  const now = Date.now();
  const record = createReviewRecord({
    game: options.game,
    settings: options.settings,
    analysis: options.analysis ?? null,
    analysisState: options.analysisState,
    lastProgress: options.lastProgress,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastAccessedAt: now,
  });
  await store.save(record);
  return record;
}

export async function touchReview(
  store: ReviewStore,
  id: string,
): Promise<void> {
  let record: StoredReviewRecord;
  try {
    record = await store.get(id);
  } catch {
    return;
  }
  await store.save({ ...record, lastAccessedAt: Date.now() });
}

export async function updateReviewAnalysis(
  store: ReviewStore,
  id: string,
  update: {
    analysisState: ReviewAnalysisState;
    analysis?: FullGameAnalysis | null;
    settings?: StoredReviewRecord["settings"];
    lastProgress?: ReviewProgressSnapshot;
  },
): Promise<void> {
  let record: StoredReviewRecord;
  try {
    record = await store.get(id);
  } catch {
    return;
  }
  const now = Date.now();
  await store.save({
    ...record,
    analysis: update.analysis === undefined ? record.analysis : update.analysis,
    settings: update.settings ?? record.settings,
    analysisState: update.analysisState,
    ...(update.lastProgress ? { lastProgress: update.lastProgress } : {}),
    updatedAt: now,
    lastAccessedAt: now,
  });
}
