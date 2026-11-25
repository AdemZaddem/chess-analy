import { describe, expect, it } from "vitest";
import { FullGameAnalysisError } from "@/lib/analysis/errors";
import { countAnalyzedPositions, FullGameAnalysisRunner } from "@/lib/analysis/full-game-service";
import { createAnalysisSettings } from "@/lib/analysis/settings";
import type { FullGameProgress } from "@/lib/analysis/types";
import {
  createScriptedEngine,
  gameFromPgn,
  makeEngineEvaluation,
} from "./full-game-test-helpers";
import { REPETITION_PGN, STANDARD_PGN } from "./fixtures";

function evaluator(fen: string, index: number) {
  return makeEngineEvaluation(fen, {
    whiteCentipawns: 10 + index,
    depth: 15,
  });
}

describe("full-game analysis service", () => {
  it("analyzes N+1 positions and returns complete typed results", async () => {
    const game = gameFromPgn(STANDARD_PGN, "game-a");
    const { engine, state } = createScriptedEngine(evaluator);
    const runner = new FullGameAnalysisRunner(engine);
    const progress: FullGameProgress[] = [];

    const result = await runner.analyze({
      game,
      settings: createAnalysisSettings("standard"),
      onProgress: (next) => progress.push(next),
    });

    expect(result.identity.gameId).toBe("game-a");
    expect(result.positions).toHaveLength(game.moves.length + 1);
    expect(result.moves).toHaveLength(game.moves.length);
    expect(countAnalyzedPositions(result)).toBe(game.moves.length + 1);
    expect(result.pgn).toBe(game.pgn);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(
      game.moves.length,
    );
    expect(result.accuracy.white.accuracy).toBeGreaterThanOrEqual(0);
    expect(result.accuracy.white.accuracy).toBeLessThanOrEqual(100);
    expect(result.accuracy.black.accuracy).toBeGreaterThanOrEqual(0);
    expect(result.accuracy.black.accuracy).toBeLessThanOrEqual(100);
    expect(result.incomplete).toBe(false);
    expect(state.maxActiveCalls).toBe(1);
    expect(progress.at(-1)).toMatchObject({
      status: "complete",
      analyzedPositions: game.moves.length + 1,
      totalPositions: game.moves.length + 1,
      percent: 1,
    });
  });

  it("keeps the FEN cache conservative for repeated piece placement", async () => {
    const game = gameFromPgn(REPETITION_PGN);
    const { engine, state } = createScriptedEngine(evaluator);
    const runner = new FullGameAnalysisRunner(engine);

    const result = await runner.analyze({
      game,
      settings: createAnalysisSettings("quick"),
    });

    expect(result.positions).toHaveLength(5);
    // Repetition changes halfmove/fullmove counters, so the full-FEN cache
    // correctly treats those as distinct engine positions.
    expect(state.calls).toHaveLength(5);
    expect(new Set(state.calls.map((call) => call.fen)).size).toBe(5);
  });

  it("reports progress after each analyzed position", async () => {
    const game = gameFromPgn(STANDARD_PGN);
    const { engine } = createScriptedEngine(evaluator);
    const runner = new FullGameAnalysisRunner(engine);
    const observed: number[] = [];

    await runner.analyze({
      game,
      settings: createAnalysisSettings("quick"),
      onProgress: (progress) => observed.push(progress.analyzedPositions),
    });

    const unique = [...new Set(observed)];
    expect(unique).toEqual(
      Array.from({ length: game.moves.length + 2 }, (_, index) => index),
    );
  });

  it("cancels cleanly and stops the engine", async () => {
    const game = gameFromPgn(STANDARD_PGN);
    const { engine, state } = createScriptedEngine(evaluator, { delayMs: 5 });
    const runner = new FullGameAnalysisRunner(engine);
    const controller = new AbortController();

    const pending = runner.analyze({
      game,
      settings: createAnalysisSettings("quick"),
      signal: controller.signal,
      onProgress: (progress) => {
        if (progress.analyzedPositions === 1) controller.abort();
      },
    });

    await expect(pending).rejects.toMatchObject({ code: "cancelled" });
    expect(state.stopCalls).toBeGreaterThan(0);
    expect(state.activeCalls).toBe(0);
    expect(runner.isRunning()).toBe(false);
  });

  it("surfaces engine failures and allows a safe retry", async () => {
    const game = gameFromPgn(STANDARD_PGN);
    const failing = createScriptedEngine(evaluator, { failOnCall: 1 });
    await expect(
      new FullGameAnalysisRunner(failing.engine).analyze({
        game,
        settings: createAnalysisSettings("quick"),
      }),
    ).rejects.toMatchObject({
      code: "engine-failed",
      message: expect.stringContaining("mock engine failure"),
    });

    const working = createScriptedEngine(evaluator);
    const runner = new FullGameAnalysisRunner(working.engine);
    const result = await runner.analyze({
      game,
      settings: createAnalysisSettings("quick"),
    });
    expect(result.moves).toHaveLength(game.moves.length);
  });

  it("reanalyzes with different settings and preserves search identity", async () => {
    const game = gameFromPgn(STANDARD_PGN);
    const { engine, state } = createScriptedEngine(evaluator);
    const runner = new FullGameAnalysisRunner(engine);

    const quick = await runner.analyze({
      game,
      settings: createAnalysisSettings("quick"),
    });
    const deep = await runner.analyze({
      game,
      settings: createAnalysisSettings("deep"),
    });

    expect(quick.identity.depth).toBe(12);
    expect(deep.identity.depth).toBe(18);
    expect(quick.identity.key).not.toBe(deep.identity.key);
    expect(state.calls.some((call) => call.depth === 12)).toBe(true);
    expect(state.calls.some((call) => call.depth === 18)).toBe(true);
  });

  it("rejects overlapping full-game runs on the same engine", async () => {
    const game = gameFromPgn(STANDARD_PGN);
    const controller = new AbortController();
    const { engine, state } = createScriptedEngine(evaluator, { delayMs: 2 });
    const runner = new FullGameAnalysisRunner(engine);

    const first = runner.analyze({
      game,
      settings: createAnalysisSettings("quick"),
      signal: controller.signal,
    });
    await expect(
      runner.analyze({ game, settings: createAnalysisSettings("quick") }),
    ).rejects.toMatchObject({ code: "already-running" });

    controller.abort();
    await expect(first).rejects.toMatchObject({ code: "cancelled" });
    expect(state.maxActiveCalls).toBe(1);
  });

  it("rejects a stale engine result for a different position", async () => {
    const game = gameFromPgn(STANDARD_PGN);
    const wrongFenEvaluation = makeEngineEvaluation(
      "8/8/8/8/8/8/8/K6k w - - 0 1",
    );
    const { engine } = createScriptedEngine(() => wrongFenEvaluation);
    const runner = new FullGameAnalysisRunner(engine);

    await expect(
      runner.analyze({ game, settings: createAnalysisSettings("quick") }),
    ).rejects.toMatchObject({ code: "stale-analysis" });
  });

  it("supports switching games after cancelling an old analysis", async () => {
    const oldGame = gameFromPgn(STANDARD_PGN, "old-game");
    const newGame = gameFromPgn(REPETITION_PGN, "new-game");
    const controller = new AbortController();
    const { engine } = createScriptedEngine(evaluator, { delayMs: 5 });
    const runner = new FullGameAnalysisRunner(engine);

    const oldRun = runner.analyze({
      game: oldGame,
      settings: createAnalysisSettings("quick"),
      signal: controller.signal,
      onProgress: (progress) => {
        if (progress.analyzedPositions === 1) controller.abort();
      },
    });
    await expect(oldRun).rejects.toBeInstanceOf(FullGameAnalysisError);

    const newResult = await runner.analyze({
      game: newGame,
      settings: createAnalysisSettings("standard"),
    });
    expect(newResult.identity.gameId).toBe("new-game");
    expect(newResult.positions).toHaveLength(newGame.moves.length + 1);
  });
});
