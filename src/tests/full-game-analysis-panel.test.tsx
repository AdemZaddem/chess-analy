/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FullGameAnalysisPanel } from "@/components/game/full-game-analysis-panel";
import { useFullGameAnalysis } from "@/hooks/use-full-game-analysis";
import type { UseFullGameAnalysisResult } from "@/hooks/use-full-game-analysis";
import { FullGameAnalysisRunner } from "@/lib/analysis/full-game-service";
import { createAnalysisSettings } from "@/lib/analysis/settings";
import type { FullGameAnalysis } from "@/lib/analysis/types";
import {
  createScriptedEngine,
  gameFromPgn,
  makeEngineEvaluation,
} from "./full-game-test-helpers";
import { PROMOTION_PGN } from "./fixtures";

vi.mock("@/hooks/use-full-game-analysis", () => ({
  useFullGameAnalysis: vi.fn(),
}));

const settings = createAnalysisSettings("standard");

async function completedAnalysis(): Promise<FullGameAnalysis> {
  const game = gameFromPgn(PROMOTION_PGN, "panel-game");
  const { engine } = createScriptedEngine((fen, index) =>
    makeEngineEvaluation(fen, { whiteCentipawns: 20 + index, depth: 15 }),
  );
  return new FullGameAnalysisRunner(engine).analyze({ game, settings });
}

function mockHook(
  result: FullGameAnalysis | null,
  overrides: Partial<UseFullGameAnalysisResult> = {},
) {
  const base: UseFullGameAnalysisResult = {
    status: result ? "complete" : "idle",
    isRunning: false,
    isAnalyzing: false,
    progress: null,
    result,
    error: null,
    analyze: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
    clear: vi.fn(),
    ...overrides,
  };
  vi.mocked(useFullGameAnalysis).mockReturnValue(base);
  return base;
}

describe("FullGameAnalysisPanel", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it("offers explicit presets and an explicit analysis action", async () => {
    const analysis = mockHook(await completedAnalysis());
    const onPresetChange = vi.fn();
    render(
      <FullGameAnalysisPanel
        settings={settings}
        preset="standard"
        onPresetChange={onPresetChange}
        selectedPly={1}
        analysis={analysis}
      />,
    );

    expect(screen.getByRole("group", { name: "Full game analysis depth" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Quick · 12" }));
    expect(onPresetChange).toHaveBeenCalledWith("quick");

    fireEvent.click(screen.getByRole("button", { name: "Analyze again" }));
    expect(analysis.analyze).toHaveBeenCalledOnce();
  });

  it("shows progress and cancel while running", () => {
    const analysis = mockHook(null, {
      status: "analyzing",
      isRunning: true,
      isAnalyzing: true,
      progress: {
        identity: {
          gameId: "panel-game",
          initialFen: "8/8/8/8/8/8/8/K6k w - - 0 1",
          playedMoves: "g2g8q",
          preset: "standard",
          depth: 15,
          multiPv: 1,
          key: "key",
        },
        status: "analyzing",
        analyzedPositions: 1,
        totalPositions: 2,
        currentPly: 1,
        currentFen: "8/6Q1/8/8/8/8/8/K6k b - - 0 1",
        percent: 0.5,
        startedAt: 0,
        elapsedMs: 120,
        message: "Analyzing g8=Q",
      },
    });
    render(
      <FullGameAnalysisPanel
        settings={settings}
        preset="standard"
        onPresetChange={vi.fn()}
        selectedPly={0}
        analysis={analysis}
      />,
    );

    expect(screen.getByText("Positions: 1/2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel analysis" }));
    expect(analysis.cancel).toHaveBeenCalledOnce();
  });

  it("renders accuracy, counts and the selected move inspector", async () => {
    const result = await completedAnalysis();
    const analysis = mockHook(result);
    const { container } = render(
      <FullGameAnalysisPanel
        settings={settings}
        preset="standard"
        onPresetChange={vi.fn()}
        selectedPly={1}
        analysis={analysis}
      />,
    );

    expect(container.textContent).toContain("White accuracy");
    expect(container.textContent).toContain("Black accuracy");
    expect(container.textContent).toContain("Brilliant");
    expect(container.textContent).toContain("Missed wins");
    expect(container.textContent).toContain("Selected move");
    expect(container.textContent).toContain("g8=Q");
    expect(container.textContent).toContain("PV:");
  });
});
