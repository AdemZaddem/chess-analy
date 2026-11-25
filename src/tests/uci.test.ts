import { describe, expect, it } from "vitest";
import {
  isReadyOk,
  isUciOk,
  normalizeScore,
  parseBestMove,
  parseIdAuthor,
  parseIdName,
  parseUciInfo,
  parseVersion,
} from "@/lib/engine/uci";

describe("UCI parsing", () => {
  it("recognizes protocol handshakes and identity lines", () => {
    expect(isUciOk("uciok")).toBe(true);
    expect(isUciOk(" uciok ")).toBe(true);
    expect(isUciOk("info string uciok")).toBe(false);
    expect(isReadyOk("readyok")).toBe(true);
    expect(parseIdName("id name Stockfish 19 Lite WASM")).toBe(
      "Stockfish 19 Lite WASM",
    );
    expect(parseIdAuthor("id author the Stockfish developers")).toBe(
      "the Stockfish developers",
    );
    expect(parseVersion("Stockfish 19 Lite WASM")).toBe("19");
  });

  it("parses centipawn info with all common fields", () => {
    const info = parseUciInfo(
      "info depth 15 seldepth 22 multipv 2 score cp -42 nodes 1234567 nps 98765 hashfull 321 time 4567 pv e2e4 e7e5 g1f3",
    );
    expect(info).toMatchObject({
      depth: 15,
      selectiveDepth: 22,
      multipv: 2,
      score: { kind: "cp", value: -42 },
      nodes: 1234567,
      nps: 98765,
      hashfull: 321,
      timeMs: 4567,
      pv: ["e2e4", "e7e5", "g1f3"],
    });
  });

  it("handles mate scores and missing optional fields", () => {
    expect(
      parseUciInfo("info depth 4 score mate -2 pv h1h8"),
    ).toMatchObject({
      depth: 4,
      score: { kind: "mate", value: -2 },
      pv: ["h1h8"],
    });
    expect(parseUciInfo("info string Network replica 1: Local memory")).toBeNull();
    expect(parseUciInfo("bestmove e2e4")).toBeNull();
  });

  it("parses MultiPV lines independently", () => {
    const first = parseUciInfo(
      "info depth 10 multipv 1 score cp 18 nodes 100 pv d2d4",
    );
    const second = parseUciInfo(
      "info depth 10 multipv 2 score mate 3 nodes 120 pv g1f3",
    );
    expect(first?.multipv).toBe(1);
    expect(second?.multipv).toBe(2);
    expect(second?.score).toEqual({ kind: "mate", value: 3 });
  });

  it("parses UCI_ShowWDL counts without absorbing them into the PV", () => {
    const info = parseUciInfo(
      "info depth 8 score cp 29 wdl 56 938 6 nodes 9492 nps 500000 hashfull 2 time 20 pv e2e4 e7e5",
    );
    expect(info?.wdl).toEqual({ win: 56, draw: 938, loss: 6 });
    expect(info?.pv).toEqual(["e2e4", "e7e5"]);
    expect(parseUciInfo("info depth 1 score cp 0 wdl bad data pv e2e4")?.wdl).toBeUndefined();
  });

  it("normalizes scores to the White perspective", () => {
    expect(normalizeScore({ kind: "cp", value: 29 }, "w")).toMatchObject({
      kind: "cp",
      centipawns: 29,
      label: "+0.29",
    });
    expect(normalizeScore({ kind: "cp", value: 29 }, "b")).toMatchObject({
      kind: "cp",
      centipawns: -29,
      label: "-0.29",
    });
    expect(normalizeScore({ kind: "mate", value: 3 }, "w")).toMatchObject({
      kind: "mate",
      mate: 3,
      label: "White mates in 3",
    });
    expect(normalizeScore({ kind: "mate", value: -2 }, "b")).toMatchObject({
      kind: "mate",
      mate: 2,
      label: "White mates in 2",
    });
    expect(normalizeScore({ kind: "mate", value: 2 }, "b")).toMatchObject({
      mate: -2,
      label: "Black mates in 2",
    });
  });

  it("parses best moves including no legal move", () => {
    expect(parseBestMove("bestmove e2e4 ponder e7e5")).toMatchObject({
      move: "e2e4",
      ponder: "e7e5",
    });
    expect(parseBestMove("bestmove (none)")).toEqual({
      move: null,
      ponder: undefined,
      raw: "bestmove (none)",
    });
    expect(parseBestMove("info depth 1")).toBeNull();
  });
});
