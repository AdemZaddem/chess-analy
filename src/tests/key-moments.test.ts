import { describe, expect, it } from "vitest";
import { createAnalysisSettings } from "@/lib/analysis/settings";
import { FullGameAnalysisRunner } from "@/lib/analysis/full-game-service";
import {
  biggestMistakes,
  buildKeyMoments,
  strongestMoves,
} from "@/lib/review/key-moments";
import {
  createScriptedEngine,
  fakeMoveAnalysis,
  gameFromPgn,
  makeEngineEvaluation,
} from "./full-game-test-helpers";
import { STANDARD_PGN } from "./fixtures";

describe("key moments", () => {
  it("returns no fabricated moments without analysis", () => {
    expect(buildKeyMoments(null)).toEqual([]);
    expect(biggestMistakes(null)).toEqual([]);
    expect(strongestMoves(null)).toEqual([]);
  });

  it("selects qualified blunders, misses and swings from real results", async () => {
    const game = gameFromPgn(STANDARD_PGN, "moments-game");
    const { engine } = createScriptedEngine((fen, index) =>
      makeEngineEvaluation(fen, {
        whiteCentipawns: index === 4 ? -600 : index * 15,
      }),
    );
    const analysis = await new FullGameAnalysisRunner(engine).analyze({
      game,
      settings: createAnalysisSettings("quick"),
    });
    const moments = buildKeyMoments(analysis);

    expect(moments.length).toBeGreaterThan(0);
    expect(new Set(moments.map((moment) => moment.ply)).size).toBe(moments.length);
    expect(moments.every((moment) => moment.detail.length > 0)).toBe(true);
    expect(moments.every((moment) => !/expected-points/.test(moment.detail))).toBe(true);
    expect(moments.every((moment) => analysis.moves.some((move) => move.ply === moment.ply))).toBe(true);
  });

  it("ranks the largest loss and never repeats a ply", () => {
    const moves = [
      fakeMoveAnalysis({ classification: "blunder", before: 0.8, after: 0.1 }),
      fakeMoveAnalysis({ classification: "missedWin", before: 0.9, after: 0.5 }),
      fakeMoveAnalysis({ classification: "brilliant", before: 0.4, after: 0.9 }),
    ].map((move, index) => ({ ...move, ply: index + 1 }));
    const analysis = {
      moves,
      positions: [],
    } as unknown as Parameters<typeof buildKeyMoments>[0];

    const moments = buildKeyMoments(analysis);
    expect(moments[0]?.kind).toBe("blunder");
    expect(moments.map((moment) => moment.kind)).toContain("missedWin");
    expect(moments.map((moment) => moment.kind)).toContain("brilliant");
    expect(new Set(moments.map((moment) => moment.ply)).size).toBe(moments.length);
  });

  it("omits empty categories", () => {
    const analysis = {
      moves: [fakeMoveAnalysis({ classification: "best", before: 0.5, after: 0.5 })],
      positions: [],
    } as unknown as Parameters<typeof buildKeyMoments>[0];
    const moments = buildKeyMoments(analysis);
    expect(moments.some((moment) => moment.kind === "blunder")).toBe(false);
    expect(moments.some((moment) => moment.kind === "missedWin")).toBe(false);
  });
});
