import { ChesscomImportError } from "@/lib/chesscom/errors";
import type {
  ChesscomImportRequest,
  ChesscomImportResponse,
  ChesscomImportSuccessResponse,
} from "@/lib/chesscom/types";
import type { ChesscomImportErrorCode } from "@/lib/chesscom/errors";

const ERROR_CODES = new Set<ChesscomImportErrorCode>([
  "invalid-request",
  "invalid-url",
  "invalid-username",
  "not-found",
  "gone",
  "rate-limited",
  "upstream-error",
  "timeout",
  "network-error",
  "invalid-json",
  "invalid-response",
  "game-not-found",
  "game-unavailable",
  "unsupported-variant",
  "invalid-pgn",
  "game-mismatch",
  "internal-error",
]);

function isErrorResponse(value: unknown): value is Extract<
  ChesscomImportResponse,
  { status: "error" }
> {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.status === "error" &&
    typeof record.code === "string" &&
    ERROR_CODES.has(record.code as ChesscomImportErrorCode) &&
    typeof record.message === "string"
  );
}

/** Calls the local server route; the browser never contacts Chess.com directly. */
export async function importChesscomGame(
  input: ChesscomImportRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<ChesscomImportSuccessResponse> {
  let response: Response;
  try {
    response = await fetchImpl("/api/import/chesscom", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch (error) {
    throw new ChesscomImportError(
      "network-error",
      "Could not reach the import service. Check your connection and try again.",
      { cause: error },
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new ChesscomImportError(
      "invalid-response",
      "The import service returned an unreadable response.",
      { status: response.status, cause: error },
    );
  }

  if (isErrorResponse(payload)) {
    throw new ChesscomImportError(payload.code, payload.message, {
      status: response.status,
      retryAfter: response.headers.get("retry-after") ?? undefined,
    });
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    (payload as Record<string, unknown>).status !== "success" ||
    typeof (payload as Record<string, unknown>).pgn !== "string"
  ) {
    throw new ChesscomImportError(
      "invalid-response",
      "The import service returned an unexpected response.",
      { status: response.status },
    );
  }

  return payload as ChesscomImportSuccessResponse;
}
