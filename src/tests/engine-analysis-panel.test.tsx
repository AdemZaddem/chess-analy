/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EngineAnalysisPanel } from "@/components/game/engine-analysis-panel";
import { useEngineAnalysis } from "@/hooks/use-engine-analysis";
import type { UseEngineAnalysisResult } from "@/hooks/use-engine-analysis";
import type { EngineEvaluation } from "@/lib/engine/types";

vi.mock("@/hooks/use-engine-analysis", () => ({
  useEngineAnalysis: vi.fn(),
}));

const FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const result: EngineEvaluation = {
  fen: FEN,
  depth: 10,
  score: 0.31,
  bestMove: "e2e4",
  bestMoveSan: "e4",
  principalVariation: ["e2e4", "c7c5"],
  principalVariationSan: ["e4", "c5"],
  engine: { name: "Stockfish 19 Lite WASM", version: "19" },
  evaluation: { kind: "cp", centipawns: 31, label: "+0.31" },
  stats: { depth: 10, nodes: 9492, nps: 499578, hashfull: 2, timeMs: 20 },
};

function mockEngine(overrides: Partial<UseEngineAnalysisResult> = {}) {
  const base: UseEngineAnalysisResult = {
    status: "ready",
    isLoading: false,
    isSearching: false,
    identity: result.engine ?? null,
    downloadProgress: null,
    searchProgress: null,
    result,
    error: null,
    initialize: vi.fn(async () => undefined),
    analyze: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    clear: vi.fn(),
  };
  vi.mocked(useEngineAnalysis).mockReturnValue({ ...base, ...overrides });
  return { ...base, ...overrides };
}

describe("EngineAnalysisPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders depth presets and sends the selected depth", () => {
    const engine = mockEngine();
    render(<EngineAnalysisPanel fen={FEN} />);

    expect(screen.getByRole("group", { name: "Search depth" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Depth 15" }));
    expect(
      screen.getByRole("button", { name: "Depth 15" }).getAttribute("aria-pressed"),
    ).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Analyze position" }));
    expect(engine.analyze).toHaveBeenCalledWith({ depth: 15 });
  });

  it("shows the genuine evaluation, best move and PV", () => {
    mockEngine();
    const { container } = render(<EngineAnalysisPanel fen={FEN} />);

    expect(container.textContent).toContain("+0.31");
    expect(container.textContent).toContain("e4 (e2e4)");
    expect(container.textContent).toContain("1. e4 c5");
    expect(container.textContent).toContain("9,492 nodes");
  });

  it("exposes stop and retry actions", () => {
    const engine = mockEngine({
      status: "searching",
      isSearching: true,
      error: "Stockfish did not become ready in time.",
      result: null,
    });
    render(<EngineAnalysisPanel fen={FEN} />);

    fireEvent.click(screen.getByRole("button", { name: "Stop analysis" }));
    expect(engine.stop).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Retry engine load" }));
    expect(engine.initialize).toHaveBeenCalledOnce();
  });
});
