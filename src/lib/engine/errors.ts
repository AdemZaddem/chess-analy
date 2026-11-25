export type EngineErrorCode =
  | "worker-unavailable"
  | "initialization-failed"
  | "worker-error"
  | "invalid-fen"
  | "invalid-output"
  | "search-failed"
  | "stop-timeout";

export class EngineError extends Error {
  readonly code: EngineErrorCode;

  constructor(code: EngineErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "EngineError";
    this.code = code;
  }
}
