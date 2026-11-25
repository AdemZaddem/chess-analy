/** @vitest-environment jsdom */
import { Chess } from "chess.js";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFullGameAnalysis } from "@/hooks/use-full-game-analysis";
import { createAnalysisSettings } from "@/lib/analysis/settings";
import { setSharedEngineWorkerFactory } from "@/lib/engine/shared-engine";
import { createMockWorkerFactory, type MockEngineWorker } from "./engine-mock-worker";
import { gameFromPgn } from "./full-game-test-helpers";
import { PROMOTION_PGN, REPETITION_PGN, STANDARD_PGN } from "./fixtures";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

const settings = createAnalysisSettings("quick");

function responder(options: { delayMs?: number } = {}) {
  let currentFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  return (command: string, worker: MockEngineWorker): void => {
    if (command.startsWith("position fen ")) {
      currentFen = command.slice("position fen ".length);
      return;
    }
    if (!command.startsWith("go ")) return;
    const moves = new Chess(currentFen).moves({ verbose: true });
    const move = moves[0];
    const uci = move ? `${move.from}${move.to}${move.promotion ?? ""}` : null;
    worker.emitLine(
      uci
        ? `info depth 12 seldepth 14 multipv 1 score cp 20 wdl 500 400 100 nodes 1000 nps 50000 hashfull 1 time 20 pv ${uci}`
        : "info depth 12 seldepth 14 multipv 1 score mate 0 wdl 0 0 1000 nodes 1000 nps 50000 hashfull 1 time 20",
    );
    const emitBestMove = () =>
      worker.emitLine(uci ? `bestmove ${uci}` : "bestmove (none)");
    if (options.delayMs) setTimeout(emitBestMove, options.delayMs);
    else emitBestMove();
  };
}

afterEach(async () => {
  setSharedEngineWorkerFactory(undefined);
  // The shared engine intentionally stays alive for 1s after the last release
  // so Strict Mode remounts can reuse one worker. Wait for that window so each
  // test gets a worker built by its own factory.
  await new Promise<void>((resolve) => setTimeout(resolve, 1_100));
});

describe("useFullGameAnalysis", () => {
  it("runs only after an explicit action and returns a game-tied result", async () => {
    const { factory, workers } = createMockWorkerFactory({ onCommand: responder() });
    setSharedEngineWorkerFactory(factory);
    const game = gameFromPgn(PROMOTION_PGN, "promotion-game");
    const { result, unmount } = renderHook(() =>
      useFullGameAnalysis(game, settings),
    );

    expect(result.current.status).toBe("idle");
    expect(result.current.result).toBeNull();

    await act(async () => {
      await result.current.analyze();
    });

    expect(result.current.status).toBe("complete");
    expect(result.current.result?.identity.gameId).toBe("promotion-game");
    expect(result.current.result?.positions).toHaveLength(2);
    expect(result.current.progress?.analyzedPositions).toBe(2);
    expect(workers).toHaveLength(1);
    unmount();
  });

  it("cancels an in-flight analysis", async () => {
    const { factory } = createMockWorkerFactory({
      onCommand: responder({ delayMs: 200 }),
    });
    setSharedEngineWorkerFactory(factory);
    const game = gameFromPgn(STANDARD_PGN, "cancel-game");
    const { result, unmount } = renderHook(() =>
      useFullGameAnalysis(game, settings),
    );

    let pending!: Promise<void>;
    await act(async () => {
      pending = result.current.analyze();
    });
    await waitFor(() => expect(result.current.status).toBe("analyzing"));
    await act(async () => {
      await result.current.cancel();
      await pending;
    });

    expect(result.current.status).toBe("cancelled");
    expect(result.current.result).toBeNull();
    unmount();
  });

  it("rejects results from an old game after switching games mid-analysis", async () => {
    const { factory } = createMockWorkerFactory({
      onCommand: responder({ delayMs: 20 }),
    });
    setSharedEngineWorkerFactory(factory);
    const oldGame = gameFromPgn(STANDARD_PGN, "old-game");
    const newGame = gameFromPgn(REPETITION_PGN, "new-game");
    const old = renderHook(() => useFullGameAnalysis(oldGame, settings));

    let oldRun!: Promise<void>;
    await act(async () => {
      oldRun = old.result.current.analyze();
    });
    await waitFor(() =>
      expect(old.result.current.progress?.analyzedPositions).toBeGreaterThan(0),
    );

    // Production remounts the keyed host when the game changes. React cleanup
    // aborts the old run, which must not publish a result into the new game.
    old.unmount();
    await act(async () => {
      await oldRun.catch(() => undefined);
    });

    const next = renderHook(() => useFullGameAnalysis(newGame, settings));
    expect(next.result.current.status).toBe("idle");
    expect(next.result.current.result).toBeNull();

    await act(async () => {
      await next.result.current.analyze();
    });
    expect(next.result.current.result?.identity.gameId).toBe("new-game");
    expect(next.result.current.result?.positions).toHaveLength(
      newGame.moves.length + 1,
    );
    next.unmount();
  });
});
