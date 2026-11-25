import type { ChesscomImportErrorCode } from "./errors";

export function chesscomErrorStatus(code: ChesscomImportErrorCode): number {
  switch (code) {
    case "invalid-request":
    case "invalid-url":
    case "invalid-username":
      return 400;
    case "not-found":
    case "game-not-found":
    case "game-unavailable":
      return 404;
    case "gone":
      return 410;
    case "rate-limited":
      return 429;
    case "timeout":
      return 504;
    case "network-error":
    case "upstream-error":
    case "invalid-json":
    case "invalid-response":
      return 502;
    case "unsupported-variant":
    case "invalid-pgn":
    case "game-mismatch":
      return 422;
    default:
      return 500;
  }
}
