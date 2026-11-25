/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useVariation } from "@/hooks/use-variation";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("useVariation", () => {
  it("clamps navigation and exposes the FEN of each step", () => {
    const { result } = renderHook(() =>
      useVariation(START, ["e2e4", "e7e5"]),
    );
    expect(result.current.fen).toBe(START);
    act(() => result.current.next());
    expect(result.current.fen.split(" ")[1]).toBe("b");
    expect(result.current.isActive).toBe(true);
    act(() => result.current.goTo(99));
    expect(result.current.index).toBe(2);
    act(() => result.current.goTo(-5));
    expect(result.current.index).toBe(0);
    act(() => result.current.previous());
    expect(result.current.index).toBe(0);
  });

  it("resets when the base game position changes", () => {
    const { result, rerender } = renderHook(
      ({ fen }: { fen: string }) => useVariation(fen, ["e2e4"]),
      { initialProps: { fen: START } },
    );
    act(() => result.current.enter());
    expect(result.current.index).toBe(1);
    rerender({ fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1" });
    expect(result.current.index).toBe(0);
    expect(result.current.fen).toContain("4P3");
  });

  it("resets when the PV changes and rejects illegal lines", () => {
    const { result, rerender } = renderHook(
      ({ pv }: { pv: string[] }) => useVariation(START, pv),
      { initialProps: { pv: ["e2e4", "e7e5"] } },
    );
    act(() => result.current.enter());
    expect(result.current.index).toBe(1);
    rerender({ pv: ["d2d4"] });
    expect(result.current.index).toBe(0);
    expect(result.current.line.moves).toHaveLength(1);

    rerender({ pv: ["e2e5"] });
    expect(result.current.line.moves).toHaveLength(0);
    expect(result.current.line.rejectedAt).toBe(1);
  });
});
