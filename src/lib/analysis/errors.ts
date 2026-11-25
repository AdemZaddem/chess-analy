export type FullGameAnalysisErrorCode =
  | "cancelled"
  | "invalid-game"
  | "engine-failed"
  | "already-running"
  | "stale-analysis"
  | "incomplete-analysis";

export class FullGameAnalysisError extends Error {
  readonly code: FullGameAnalysisErrorCode;

  constructor(
    code: FullGameAnalysisErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "FullGameAnalysisError";
    this.code = code;
  }
}

export function isCancellationError(error: unknown): boolean {
  return (
    (error instanceof FullGameAnalysisError && error.code === "cancelled") ||
    (error instanceof DOMException && error.name === "AbortError")
  );
}

export function analysisErrorMessage(error: unknown): string {
  if (isCancellationError(error)) return "Analysis cancelled.";
  if (error instanceof Error) return error.message;
  return "Full-game analysis failed unexpectedly.";
}
