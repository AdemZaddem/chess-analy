/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReviewWorkspace } from "@/components/review/review-workspace";
import type { UseFullGameAnalysisResult } from "@/hooks/use-full-game-analysis";
import { useGameViewer } from "@/hooks/use-game-viewer";
import { FullGameAnalysisRunner } from "@/lib/analysis/full-game-service";
import { createAnalysisSettings } from "@/lib/analysis/settings";
import type { FullGameAnalysis } from "@/lib/analysis/types";
import type { NormalizedGame } from "@/lib/chess/types";
import {
  createScriptedEngine,
  gameFromPgn,
  makeEngineEvaluation,
} from "./full-game-test-helpers";
import { LONG_PGN, STANDARD_PGN } from "./fixtures";

vi.mock("react-chessboard", () => ({
  Chessboard: ({
    options,
  }: {
    options: { position: string; arrows: Array<{ startSquare: string }> };
  }) => (
    <div
      data-testid="chessboard"
      data-fen={options.position}
      data-arrows={options.arrows.length}
    />
  ),
}));

function analysisResult(result: FullGameAnalysis | null): UseFullGameAnalysisResult {
  return {
    status: result ? "complete" : "idle",
    isRunning: false,
    isAnalyzing: false,
    progress: null,
    result,
    error: null,
    analyze: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
    clear: vi.fn(),
  };
}

function Harness({
  game,
  result,
  preset = "standard",
}: {
  game: NormalizedGame;
  result: FullGameAnalysis | null;
  preset?: "standard" | "quick";
}) {
  const viewer = useGameViewer(game);
  return (
    <ReviewWorkspace
      game={game}
      viewer={viewer}
      analysis={analysisResult(result)}
      settings={createAnalysisSettings(preset)}
      preset={preset}
      onPresetChange={vi.fn()}
      orientation="white"
      onFlip={vi.fn()}
    />
  );
}

async function analyze(game: NormalizedGame): Promise<FullGameAnalysis> {
  const { engine } = createScriptedEngine((fen, index) =>
    makeEngineEvaluation(fen, { whiteCentipawns: index * 12, depth: 12 }),
  );
  return new FullGameAnalysisRunner(engine).analyze({
    game,
    settings: createAnalysisSettings("quick"),
  });
}

describe("review workspace synchronization", () => {
  afterEach(cleanup);

  it("keeps board, move list and graph on one authoritative ply", async () => {
    const game = gameFromPgn(STANDARD_PGN, "workspace-game");
    const result = await analyze(game);
    render(<Harness game={game} result={result} preset="quick" />);

    await waitFor(() => expect(screen.getByTestId("chessboard")).toBeTruthy());
    expect(screen.getByTestId("chessboard").getAttribute("data-fen")).toBe(game.initialFen);

    const graphPoint = screen.getByRole("button", { name: /Ply 2/ });
    fireEvent.click(graphPoint);
    await waitFor(() =>
      expect(screen.getByTestId("chessboard").getAttribute("data-fen")).toBe(game.moves[1]!.fen),
    );
    const activeMove = screen.getByRole("button", {
      name: /^1\.\.\. e5/,
    });
    expect(activeMove.getAttribute("aria-current")).toBe("step");
    expect(screen.getByText(/Ply 2 ·/)).toBeTruthy();
    expect(screen.getByLabelText("Board arrow legend")).toBeTruthy();

    fireEvent.click(activeMove);
    expect(screen.getAllByRole("button", { name: /Ply/ }).length).toBeGreaterThan(0);
  });

  it("explores a variation without changing game navigation or history", async () => {
    const game = gameFromPgn(STANDARD_PGN, "variation-workspace");
    const result = await analyze(game);
    render(<Harness game={game} result={result} preset="quick" />);
    await waitFor(() => expect(screen.getByTestId("chessboard")).toBeTruthy());

    // The variation belongs to a selected move, so select White's first move.
    fireEvent.click(screen.getByRole("button", { name: /^1\. e4/ }));
    const gameFen = screen.getByTestId("chessboard").getAttribute("data-fen");
    expect(gameFen).toBe(game.moves[0]!.fen);

    fireEvent.click(screen.getByRole("button", { name: /Step into line/ }));
    const variationFen = screen.getByTestId("chessboard").getAttribute("data-fen");
    expect(variationFen).not.toBe(gameFen);
    expect(screen.getByText(/Viewing engine variation/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^1\. e4/ }).getAttribute("aria-current")).toBe("step");

    fireEvent.click(screen.getByRole("button", { name: "Return to game" }));
    expect(screen.getByTestId("chessboard").getAttribute("data-fen")).toBe(gameFen);
    expect(screen.queryByText(/Viewing engine variation/)).toBeNull();
    expect(result.moves[0]?.san).toBe("e4");
  });

  it("clears stale graph, annotations and navigation for a new game", async () => {
    const first = gameFromPgn(LONG_PGN, "first-game");
    const second = gameFromPgn(STANDARD_PGN, "second-game");
    const firstResult = await analyze(first);
    const { rerender } = render(<Harness game={first} result={firstResult} />);
    await waitFor(() => expect(screen.getByTestId("chessboard")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Ply 10/ }));
    expect(screen.getByTestId("chessboard").getAttribute("data-fen")).toBe(first.moves[9]!.fen);

    rerender(<Harness game={second} result={null} />);
    expect(screen.getByTestId("chessboard").getAttribute("data-fen")).toBe(second.initialFen);
    expect(screen.getByText(/Analyze the full game to see/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Ply 10/ })).toBeNull();
  });
});
