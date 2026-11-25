/** @vitest-environment jsdom */
import { Chess } from "chess.js";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FullGameAnalysisRunner } from "@/lib/analysis/full-game-service";
import { createAnalysisSettings } from "@/lib/analysis/settings";
import type { FullGameAnalysisEvent } from "@/hooks/use-full-game-analysis";
import { useFullGameAnalysis } from "@/hooks/use-full-game-analysis";
import { setSharedEngineWorkerFactory } from "@/lib/engine/shared-engine";
import { createMockWorkerFactory, type MockEngineWorker } from "./engine-mock-worker";
import {
  createScriptedEngine,
  makeEngineEvaluation,
} from "./full-game-test-helpers";
import { completeAnalysis, deterministicGame } from "./phase6-test-helpers";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

const settings = createAnalysisSettings("quick");

function responder() {
  let currentFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  return (command: string, worker: MockEngineWorker): void => {
    if (command.startsWith("position fen ")) {
      currentFen = command.slice("position fen ".length);
      return;
    }
    if (!command.startsWith("go ")) return;
    const move = new Chess(currentFen).moves({ verbose: true })[0];
    const uci = move ? `${move.from}${move.to}${move.promotion ?? ""}` : null;
    worker.emitLine(
      uci
        ? `info depth 12 score cp 20 wdl 500 400 100 nodes 1000 nps 50000 hashfull 1 time 20 pv ${uci}`
        : "info depth 12 score mate 0 wdl 0 0 1000 nodes 1000 nps 50000 hashfull 1 time 20",
    );
    worker.emitLine(uci ? `bestmove ${uci}` : "bestmove (none)");
  };
}

afterEach(async () => {
  setSharedEngineWorkerFactory(undefined);
  await new Promise<void>((resolve) => setTimeout(resolve, 1_100));
});

describe("Phase 6 performance and stability", () => {
  it("releases the single-run guard after an early replay failure", async () => {
    const game = deterministicGame();
    const invalidGame = {
      ...game,
      moves: game.moves.map((move, index) =>
        index === 0 ? { ...move, color: "b" as const } : move,
      ),
    };
    const { engine, state } = createScriptedEngine((fen, index) =>
      makeEngineEvaluation(fen, { whiteCentipawns: index }),
    );
    const runner = new FullGameAnalysisRunner(engine);

    await expect(
      runner.analyze({ game: invalidGame, settings }),
    ).rejects.toThrow(/recorded as b/);
    expect(runner.isRunning()).toBe(false);
    expect(state.calls).toHaveLength(0);

    const result = await runner.analyze({ game, settings });
    expect(result.positions).toHaveLength(game.moves.length + 1);
    expect(runner.isRunning()).toBe(false);
  });

  it("refuses overlapping full-game runs on the same engine", async () => {
    const game = deterministicGame();
    const { engine } = createScriptedEngine(
      (fen, index) => makeEngineEvaluation(fen, { whiteCentipawns: index }),
      { delayMs: 20 },
    );
    const runner = new FullGameAnalysisRunner(engine);
    const first = runner.analyze({ game, settings });

    const second = await runner.analyze({ game, settings }).catch((error: unknown) => error);
    expect(second).toMatchObject({ code: "already-running" });
    await first;
    expect(runner.isRunning()).toBe(false);
  });

  it("restores a completed snapshot without sending a search to the engine", async () => {
    const game = deterministicGame();
    const analysis = await completeAnalysis(game, settings);
    const { factory, workers } = createMockWorkerFactory({ onCommand: responder() });
    setSharedEngineWorkerFactory(factory);
    const events: FullGameAnalysisEvent[] = [];
    const { result, unmount } = renderHook(() =>
      useFullGameAnalysis(game, settings, {
        initialResult: analysis,
        onEvent: (event) => events.push(event),
      }),
    );

    expect(result.current.status).toBe("complete");
    expect(result.current.result?.identity.key).toBe(analysis.identity.key);
    // The shared service is acquired on mount, but its Worker is created
    // lazily on first use; a restored snapshot must not trigger that work.
    expect(workers).toHaveLength(0);
    expect(events).toEqual([]);

    await act(async () => {
      await result.current.analyze();
    });
    expect(workers).toHaveLength(1);
    expect(events.map((event) => event.type)).toEqual(["start", "complete"]);
    expect(workers[0]?.sent.some((command) => command.startsWith("go "))).toBe(true);
    unmount();
  });
});
