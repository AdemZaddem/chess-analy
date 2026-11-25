export type ChesscomImportErrorCode =
  | "invalid-request"
  | "invalid-url"
  | "invalid-username"
  | "not-found"
  | "gone"
  | "rate-limited"
  | "upstream-error"
  | "timeout"
  | "network-error"
  | "invalid-json"
  | "invalid-response"
  | "game-not-found"
  | "game-unavailable"
  | "unsupported-variant"
  | "invalid-pgn"
  | "game-mismatch"
  | "internal-error";

export class ChesscomImportError extends Error {
  readonly code: ChesscomImportErrorCode;
  readonly status?: number;
  readonly retryAfter?: string;

  constructor(
    code: ChesscomImportErrorCode,
    message: string,
    options?: { status?: number; retryAfter?: string; cause?: unknown },
  ) {
    super(message, options);
    this.name = "ChesscomImportError";
    this.code = code;
    this.status = options?.status;
    this.retryAfter = options?.retryAfter;
  }
}
