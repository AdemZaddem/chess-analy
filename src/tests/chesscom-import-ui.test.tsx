// @vitest-environment jsdom
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AnalysisWorkspace } from "@/components/analysis-workspace";
import { STANDARD_PGN } from "./fixtures";

vi.mock("next/dynamic", () => ({
  default: () => {
    function BoardStub() {
      return React.createElement("div", { "data-testid": "chessboard" });
    }
    return BoardStub;
  },
}));

const GAME_ID = "184727190848";
const GAME_URL = `https://www.chess.com/game/live/${GAME_ID}`;

function successFetch() {
  return vi.fn(async () =>
    new Response(
      JSON.stringify({
        status: "success",
        pgn: STANDARD_PGN,
        gameUrl: GAME_URL,
        metadata: {
          gameUrl: GAME_URL,
          gameId: GAME_ID,
          gameType: "live",
          rules: "chess",
        },
        source: {
          kind: "chesscom",
          gameUrl: GAME_URL,
          username: "alice",
          gameId: GAME_ID,
          gameType: "live",
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
}

function failureFetch() {
  return vi.fn(async () =>
    new Response(
      JSON.stringify({
        status: "error",
        code: "game-not-found",
        message: "That game was not found in the supplied player's public archives.",
      }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    ),
  );
}

async function pastePgnAndImport() {
  fireEvent.click(screen.getByRole("tab", { name: "Paste PGN" }));
  fireEvent.change(screen.getByLabelText("PGN notation"), {
    target: { value: STANDARD_PGN },
  });
  fireEvent.click(screen.getByRole("button", { name: "Analyze PGN" }));
  await screen.findByRole("heading", { name: "Alice vs Bob" });
}

async function submitChesscomForm() {
  fireEvent.click(screen.getByRole("tab", { name: "Chess.com" }));
  fireEvent.change(screen.getByLabelText("Chess.com game URL"), {
    target: { value: GAME_URL },
  });
  fireEvent.change(screen.getByLabelText("Chess.com username"), {
    target: { value: "Alice" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Import game" }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Chess.com import UI integration", () => {
  it("imports a Chess.com game into the existing viewer and supports navigation", async () => {
    vi.stubGlobal("fetch", successFetch());
    render(<AnalysisWorkspace />);

    await submitChesscomForm();

    const confirmation = await screen.findByRole("status");
    expect(confirmation.textContent).toContain(
      "Successfully imported Chess.com live game",
    );
    expect(screen.getByRole("heading", { name: "Alice vs Bob" })).toBeTruthy();
    expect(screen.getByTestId("chessboard")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next move" }));
    await waitFor(() => {
      expect(screen.getByText("Move 1. · e4")).toBeTruthy();
    });
  });

  it("keeps PGN import working", async () => {
    render(<AnalysisWorkspace />);
    await pastePgnAndImport();
    expect(screen.getByTestId("chessboard")).toBeTruthy();
    expect(screen.getByText("Pasted PGN")).toBeTruthy();
  });

  it("does not destroy a loaded game when Chess.com import fails", async () => {
    render(<AnalysisWorkspace />);
    await pastePgnAndImport();

    fireEvent.click(screen.getByRole("button", { name: "Import another" }));
    vi.stubGlobal("fetch", failureFetch());
    await submitChesscomForm();

    await screen.findByRole("alert");
    expect(screen.getByText(/was not found/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back to game" }));

    expect(screen.getByRole("heading", { name: "Alice vs Bob" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next move" })).toBeTruthy();
  });
});
