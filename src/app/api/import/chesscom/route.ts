import { NextResponse } from "next/server";
import { ChesscomImportError } from "@/lib/chesscom/errors";
import { findChesscomGame } from "@/lib/chesscom/game-search";
import { chesscomErrorStatus } from "@/lib/chesscom/http-status";
import {
  parseChesscomImportRequest,
  type ChesscomImportResponse,
} from "@/lib/chesscom/types";

function errorResponse(error: ChesscomImportError): NextResponse<ChesscomImportResponse> {
  const body: ChesscomImportResponse = {
    status: "error",
    code: error.code,
    message: error.message,
  };
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (error.retryAfter) headers["Retry-After"] = error.retryAfter;
  return NextResponse.json(body, {
    status: chesscomErrorStatus(error.code),
    headers,
  });
}

export async function POST(request: Request): Promise<NextResponse<ChesscomImportResponse>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(
      new ChesscomImportError(
        "invalid-request",
        "Request body must be valid JSON.",
      ),
    );
  }

  try {
    const input = parseChesscomImportRequest(body);
    const result = await findChesscomGame(input);
    return NextResponse.json(result, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof ChesscomImportError) return errorResponse(error);
    return errorResponse(
      new ChesscomImportError(
        "internal-error",
        "Chess.com import failed unexpectedly. Please try again.",
        { cause: error },
      ),
    );
  }
}
