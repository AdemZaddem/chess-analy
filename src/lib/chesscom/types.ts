import type { ChesscomGameSource } from "../chess/types";
import { ChesscomImportError } from "./errors";
import type { ChesscomGameType } from "./game-url";

export type ChesscomImportSource = ChesscomGameSource;

export interface ChesscomGameDetails {
  gameUrl: string;
  gameId: string;
  gameType: ChesscomGameType;
  rules: string;
  timeClass?: string;
  white?: string;
  black?: string;
}

export interface ChesscomImportSuccessResponse {
  status: "success";
  pgn: string;
  gameUrl: string;
  metadata: ChesscomGameDetails;
  source: ChesscomImportSource;
}

export interface ChesscomImportErrorResponse {
  status: "error";
  code: import("./errors").ChesscomImportErrorCode;
  message: string;
}

export type ChesscomImportResponse =
  | ChesscomImportSuccessResponse
  | ChesscomImportErrorResponse;

export interface ChesscomImportRequest {
  gameUrl: string;
  username: string;
}

export function parseChesscomImportRequest(
  body: unknown,
): ChesscomImportRequest {
  if (typeof body !== "object" || body === null) {
    throw new ChesscomImportError(
      "invalid-request",
      "Request body must be a JSON object.",
    );
  }

  const record = body as Record<string, unknown>;
  if (
    typeof record.gameUrl !== "string" ||
    typeof record.username !== "string"
  ) {
    throw new ChesscomImportError(
      "invalid-request",
      "Both gameUrl and username are required strings.",
    );
  }

  return { gameUrl: record.gameUrl, username: record.username };
}
