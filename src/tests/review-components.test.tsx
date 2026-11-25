/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardReviewHints } from "@/components/review/board-review-hints";
import { EvaluationBar } from "@/components/review/evaluation-bar";
import { EvaluationGraph } from "@/components/review/evaluation-graph";
import { MoveInspector } from "@/components/review/move-inspector";
import { ReviewSummary } from "@/components/review/review-summary";
import { VariationViewer } from "@/components/review/variation-viewer";
import { useVariation } from "@/hooks/use-variation";
import { FullGameAnalysisRunner } from "@/lib/analysis/full-game-service";
import { createAnalysisSettings } from "@/lib/analysis/settings";
import { buildBoardAnnotations } from "@/lib/review/annotations";
import { buildEvaluationGraph } from "@/lib/review/evaluation";
import type { GraphPoint } from "@/lib/review/evaluation";
import {
  createScriptedEngine,
  fakeMoveAnalysis,
  fakePositionEvaluation,
  gameFromPgn,
  makeEngineEvaluation,
} from "./full-game-test-helpers";
import { STANDARD_PGN } from "./fixtures";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function point(ply: number, overrides: Partial<GraphPoint> = {}): GraphPoint {
  return {
    ply,
    fen: START,
    whitePawns: 0.5,
    plotValue: 0.5,
    isMate: false,
    mate: null,
    label: "+0.5",
    hasEvaluation: true,
    uncertain: false,
    ...overrides,
  };
}

async function analyzed() {
  const game = gameFromPgn(STANDARD_PGN, "components-game");
  const { engine } = createScriptedEngine((fen, index) =>
    makeEngineEvaluation(fen, { whiteCentipawns: index * 10, depth: 12 }),
  );
  const result = await new FullGameAnalysisRunner(engine).analyze({
    game,
    settings: createAnalysisSettings("quick"),
  });
  return { game, result };
}

describe("evaluation bar", () => {
  afterEach(cleanup);

  it("gives White most of the bar for a White advantage", () => {
    const evaluation = fakePositionEvaluation(0.9);
    const { getByTestId } = render(
      <EvaluationBar evaluation={evaluation} orientation="white" />,
    );
    const bar = getByTestId("evaluation-bar");
    expect(bar.getAttribute("aria-valuetext")).toContain("White");
    expect(Number(bar.getAttribute("aria-valuenow"))).toBeGreaterThan(50);
  });

  it("flips segment order with board orientation", () => {
    const evaluation = fakePositionEvaluation(0.9);
    const { container } = render(
      <EvaluationBar evaluation={evaluation} orientation="black" />,
    );
    const bar = container.querySelector('[data-testid="evaluation-bar"]');
    const first = bar?.firstElementChild;
    expect(first?.className).toContain("bg-[#dce9df]");
  });

  it("shows a mate indicator and stays neutral when evaluation is missing", () => {
    const mate = fakePositionEvaluation(1, {
      score: { kind: "mate", mate: -4, label: "Black mates in 4" },
      centipawns: null,
      mate: -4,
      whiteEvaluation: null,
    });
    const { getByTestId, unmount } = render(
      <EvaluationBar evaluation={mate} orientation="white" />,
    );
    expect(getByTestId("evaluation-bar").getAttribute("aria-valuetext")).toContain("Black mates");
    expect(screen.getByText("-M2")).toBeTruthy();
    unmount();

    render(<EvaluationBar evaluation={null} orientation="white" />);
    const bar = getByTestId("evaluation-bar");
    expect(bar.getAttribute("aria-valuetext")).toBe("Evaluation unavailable");
    expect(bar.getAttribute("aria-valuenow")).toBe("50");
  });
});

describe("evaluation graph component", () => {
  afterEach(cleanup);

  it("renders mate points distinctly and navigates on click", () => {
    const onSelect = vi.fn();
    render(
      <EvaluationGraph
        points={[
          point(0),
          point(1, { isMate: true, mate: 3, label: "M2", plotValue: 9.5, whitePawns: null }),
        ]}
        selectedPly={0}
        onSelectPly={onSelect}
      />,
    );

    const mateButton = screen.getByRole("button", { name: /mate M2/ });
    expect(mateButton.querySelector("rect")).toBeTruthy();
    fireEvent.click(mateButton);
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("supports keyboard selection and reflects the selected ply", () => {
    const onSelect = vi.fn();
    render(
      <EvaluationGraph
        points={[point(0), point(1), point(2)]}
        selectedPly={2}
        onSelectPly={onSelect}
      />,
    );
    expect(screen.getByText("Ply 2 · +0.5 White")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("button", { name: /Ply 1/ }), { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("shows a safe empty state without analysis", () => {
    render(<EvaluationGraph points={[]} selectedPly={0} onSelectPly={vi.fn()} />);
    expect(screen.getByText(/Analyze the full game/)).toBeTruthy();
  });

  it("derives graph points from a completed analysis", async () => {
    const { result } = await analyzed();
    const points = buildEvaluationGraph(result);
    render(
      <EvaluationGraph
        points={points}
        selectedPly={result.moves[0]!.ply}
        onSelectPly={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("button").length).toBeGreaterThan(result.moves.length);
  });
});

describe("board review hints", () => {
  afterEach(cleanup);

  it("shows a significant classification and explains the arrow colors", () => {
    const move = {
      ...fakeMoveAnalysis({ color: "b", classification: "blunder" }),
      san: "g6",
      bestMoveSan: "Nf6",
      isBestMove: false,
    };
    const annotations = buildBoardAnnotations({
      fen: START,
      playedMove: { from: "g7", to: "g6" },
      engineUci: "g1f3",
    });
    render(<BoardReviewHints move={move} annotations={annotations} variationActive={false} />);

    expect(screen.getByTestId("selected-move-classification").textContent).toContain(
      "Blunder — Black played g6",
    );
    expect(screen.getByTestId("selected-move-classification").textContent).toContain(
      "engine preferred Nf6",
    );
    const legend = screen.getByLabelText("Board arrow legend");
    expect(legend.textContent).toContain("Played move");
    expect(legend.textContent).toContain("Engine choice");
  });

  it("stays quiet for ordinary moves and empty annotations", () => {
    const { container } = render(
      <BoardReviewHints
        move={fakeMoveAnalysis({ classification: "good" })}
        annotations={{ arrows: [], squareStyles: {} }}
        variationActive={false}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows only the variation legend while stepping through a line", () => {
    const move = fakeMoveAnalysis({ classification: "blunder" });
    const annotations = buildBoardAnnotations({
      fen: START,
      variationMove: { from: "d2", to: "d4" },
    });
    render(<BoardReviewHints move={move} annotations={annotations} variationActive />);

    expect(screen.queryByTestId("selected-move-classification")).toBeNull();
    expect(screen.getByLabelText("Board arrow legend").textContent).toContain("Variation step");
  });
});

describe("variation viewer", () => {
  afterEach(cleanup);

  it("navigates steps and returns to the game without external navigation", () => {
    // Keep the hook and viewer in one tree so clicks update the props the
    // viewer receives (matching how ReviewWorkspace uses them).
    let state!: ReturnType<typeof useVariation>;
    function Harness() {
      state = useVariation(START, ["e2e4", "e7e5"]);
      return <VariationViewer variation={state} playedSan="d2d4" />;
    }
    render(<Harness />);

    expect(screen.getByText(/Played:/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Step into line" }));
    expect(state.fen).not.toBe(START);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(state.index).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: "Return to game" }));
    expect(state.index).toBe(0);
    expect(state.fen).toBe(START);
  });

  it("renders nothing when the PV has no legal moves", () => {
    const hook = renderHook(() => useVariation(START, ["e9e5"]));
    const { container } = render(<VariationViewer variation={hook.result.current} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("review summary and inspector", () => {
  afterEach(cleanup);

  it("shows accuracy, counts and clickable key moments", async () => {
    const { game, result } = await analyzed();
    const onSelect = vi.fn();
    render(<ReviewSummary game={game} analysis={result} onSelectPly={onSelect} />);

    expect(screen.getByText("White accuracy")).toBeTruthy();
    expect(screen.getByText("Black accuracy")).toBeTruthy();
    expect(screen.getAllByText(/Ruy Lopez|1-0/).length).toBeGreaterThan(0);
    const keyMoments = screen.getByRole("region", { name: "Key moments" });
    const buttons = Array.from(keyMoments.querySelectorAll("button"));
    expect(buttons.length).toBeGreaterThan(0);
    fireEvent.click(buttons[0]!);
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("does not invent key moments without analysis", () => {
    const game = gameFromPgn(STANDARD_PGN, "empty-summary");
    render(<ReviewSummary game={game} analysis={null} onSelectPly={vi.fn()} />);
    expect(screen.getByText(/Accuracy and key moments appear/)).toBeTruthy();
  });

  it("presents only engine-grounded move facts", () => {
    const move = { ...fakeMoveAnalysis(), isPromotion: true, isCapture: true };
    const { container } = render(<MoveInspector move={move} />);
    expect(container.textContent).toContain("Selected move");
    expect(container.textContent).toContain("Change:");
    expect(container.textContent).toContain("capture");
    expect(container.textContent).toContain("promotion");
  });
});
