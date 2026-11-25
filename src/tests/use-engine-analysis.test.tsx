/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useEngineAnalysis } from "@/hooks/use-engine-analysis";
import { setSharedEngineWorkerFactory } from "@/lib/engine/shared-engine";
import { createMockWorkerFactory, legalUciMove } from "./engine-mock-worker";

const FEN_A = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const FEN_B = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
const MOVE_A = legalUciMove(FEN_A, (san) => san === "e4");
const MOVE_B = legalUciMove(FEN_B, (san) => san === "e5");

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function info(move: string): string {
  return `info depth 6 seldepth 8 score cp 30 nodes 500 nps 1000 hashfull 1 time 500 pv ${move}`;
}

afterEach(() => {
  setSharedEngineWorkerFactory(undefined);
});

describe("useEngineAnalysis", () => {
  it("discards results from a position the user navigated away from", async () => {
    let goCount = 0;
    const { factory } = createMockWorkerFactory({
      onCommand(command, worker) {
        if (command === "stop") {
          worker.emitLine(`bestmove ${MOVE_A}`);
          return;
        }
        if (!command.startsWith("go ")) return;
        goCount += 1;
        if (goCount === 1) {
          worker.emitLine(info(MOVE_A));
          return;
        }
        worker.emitLine(info(MOVE_B));
        worker.emitLine(`bestmove ${MOVE_B}`);
      },
    });
    setSharedEngineWorkerFactory(factory);

    const { result, rerender, unmount } = renderHook(
      ({ fen }: { fen: string }) => useEngineAnalysis(fen),
      { initialProps: { fen: FEN_A } },
    );

    await act(async () => {
      await result.current.initialize();
    });
    expect(result.current.status).toBe("ready");

    let firstSearch!: Promise<void>;
    await act(async () => {
      firstSearch = result.current.analyze({ depth: 10 });
      await tick();
    });
    expect(result.current.status).toBe("searching");
    expect(result.current.searchProgress?.fen).toBe(FEN_A);

    rerender({ fen: FEN_B });
    await act(async () => {
      await firstSearch.catch(() => undefined);
      await tick();
    });
    expect(result.current.result).toBeNull();
    expect(result.current.searchProgress).toBeNull();

    await act(async () => {
      await result.current.analyze({ depth: 10 });
    });
    expect(result.current.result).toMatchObject({
      fen: FEN_B,
      bestMove: MOVE_B,
      evaluation: { kind: "cp", centipawns: -30 },
    });

    unmount();
  });
});
