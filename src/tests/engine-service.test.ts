import { describe, expect, it } from "vitest";
import { StockfishEngineService } from "@/lib/engine/stockfish-service";
import type { EngineStatusEvent } from "@/lib/engine/types";
import {
  createMockWorkerFactory,
  legalUciMove,
} from "./engine-mock-worker";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const MIDGAME_FEN =
  "4rrk1/pp1n3p/3q2pQ/2p1pb2/2PP4/2P3N1/P2B2PP/4RRK1 b - - 7 19";
const MATE_FEN = "7k/6Q1/6K1/8/8/8/8/8 b - - 0 1";
const PROMOTION_FEN = "7k/P7/8/8/8/8/8/K7 w - - 0 1";
const CASTLING_FEN = "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1";
const EN_PASSANT_FEN = "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1";

const START_MOVE = legalUciMove(START_FEN, (san) => san === "e4");
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function infoLine(
  fen: string,
  options: {
    score?: string;
    pv?: string;
    depth?: number;
    multipv?: number;
    wdl?: string;
  } = {},
) {
  const move = options.pv === undefined ? legalUciMove(fen) : options.pv;
  return `info depth ${options.depth ?? 8} seldepth 10 multipv ${
    options.multipv ?? 1
  } score ${options.score ?? "cp 25"} ${
    options.wdl ? `wdl ${options.wdl} ` : ""
  }nodes 12345 nps 6000 hashfull 4 time 2000 pv ${move}`;
}

describe("StockfishEngineService", () => {
  it("initializes through the worker and reports readiness", async () => {
    const { factory, workers } = createMockWorkerFactory();
    const service = new StockfishEngineService({ workerFactory: factory });
    const events: EngineStatusEvent["type"][] = [];
    service.subscribe((event) => events.push(event.type));

    expect(service.isReady()).toBe(false);
    await service.initialize();

    expect(service.isReady()).toBe(true);
    expect(service.getIdentity()).toMatchObject({
      name: "Stockfish 19 Lite WASM",
      version: "19",
    });
    expect(workers).toHaveLength(1);
    expect(workers[0]?.sent).toEqual([
      "uci",
      "setoption name UCI_ShowWDL value true",
      "isready",
    ]);
    expect(events).toContain("initializing");
    expect(events).toContain("ready");
    service.terminate();
  });

  it("completes a depth-limited search and validates the result", async () => {
    const move = START_MOVE;
    const { factory, workers } = createMockWorkerFactory({
      onCommand(command, worker) {
        if (!command.startsWith("go ")) return;
        worker.emitLine(infoLine(START_FEN, { pv: `${move} e7e5`, depth: 6 }));
        worker.emitLine(`bestmove ${move} ponder e7e5`);
      },
    });
    const service = new StockfishEngineService({ workerFactory: factory });
    await service.initialize();

    const result = await service.analyzePosition(START_FEN, { depth: 6 });

    expect(result).toMatchObject({
      fen: START_FEN,
      depth: 6,
      evaluation: { kind: "cp", centipawns: 25 },
      score: 0.25,
      bestMove: move,
      principalVariation: [move, "e7e5"],
      principalVariationSan: ["e4", "e5"],
      stats: { nodes: 12345, nps: 6000, hashfull: 4, timeMs: 2000 },
    });
    expect(workers[0]?.sent).toContain("go depth 6");
    service.terminate();
  });

  it("normalizes black-to-move scores and supports movetime", async () => {
    const move = legalUciMove(MIDGAME_FEN);
    const { factory, workers } = createMockWorkerFactory({
      onCommand(command, worker) {
        if (!command.startsWith("go ")) return;
        worker.emitLine(
          infoLine(MIDGAME_FEN, {
            score: "cp 20",
            pv: move,
            depth: 12,
            multipv: 2,
          }),
        );
        worker.emitLine(`bestmove ${move}`);
      },
    });
    const service = new StockfishEngineService({ workerFactory: factory });
    await service.initialize();

    const result = await service.analyzePosition(MIDGAME_FEN, {
      moveTimeMs: 250,
      multiPv: 2,
    });

    expect(result.evaluation.centipawns).toBe(-20);
    expect(result.stats.multiPv).toBe(2);
    expect(workers[0]?.sent).toContain("go movetime 250");
    expect(workers[0]?.sent).toContain("setoption name MultiPV value 2");
    service.terminate();
  });

  it("carries UCI_ShowWDL counts into the evaluation", async () => {
    const move = START_MOVE;
    const { factory, workers } = createMockWorkerFactory({
      onCommand(command, worker) {
        if (!command.startsWith("go ")) return;
        worker.emitLine(
          infoLine(START_FEN, { pv: move, wdl: "56 938 6" }),
        );
        worker.emitLine(`bestmove ${move}`);
      },
    });
    const service = new StockfishEngineService({ workerFactory: factory });
    await service.initialize();

    const result = await service.analyzePosition(START_FEN, { depth: 8 });

    expect(result.wdl).toEqual({ win: 56, draw: 938, loss: 6 });
    expect(result.rawInfo).toContain("wdl 56 938 6");
    expect(workers[0]?.sent).toContain("setoption name UCI_ShowWDL value true");
    service.terminate();
  });

  it("keeps mate scores distinct from centipawns", async () => {
    const { factory } = createMockWorkerFactory({
      onCommand(command, worker) {
        if (!command.startsWith("go ")) return;
        worker.emitLine(infoLine(MATE_FEN, { score: "mate -1", pv: "" }));
        worker.emitLine("bestmove (none)");
      },
    });
    const service = new StockfishEngineService({ workerFactory: factory });
    await service.initialize();

    const result = await service.analyzePosition(MATE_FEN, { depth: 4 });

    expect(result.score).toBeNull();
    expect(result.evaluation).toMatchObject({
      kind: "mate",
      mate: 1,
      label: "White mates in 1",
    });
    expect(result.bestMove).toBeUndefined();
    service.terminate();
  });

  it("validates promotion, castling and en passant best moves", async () => {
    const cases = [
      {
        fen: PROMOTION_FEN,
        move: legalUciMove(PROMOTION_FEN, (san) => san.includes("=Q")),
        sanFragment: "=Q",
      },
      {
        fen: CASTLING_FEN,
        move: legalUciMove(CASTLING_FEN, (san) => san === "O-O"),
        sanFragment: "O-O",
      },
      {
        fen: EN_PASSANT_FEN,
        move: legalUciMove(EN_PASSANT_FEN, (san) => san.includes("exd6")),
        sanFragment: "exd6",
      },
    ];

    for (const testCase of cases) {
      const { factory } = createMockWorkerFactory({
        onCommand(command, worker) {
          if (!command.startsWith("go ")) return;
          worker.emitLine(infoLine(testCase.fen, { pv: testCase.move }));
          worker.emitLine(`bestmove ${testCase.move}`);
        },
      });
      const service = new StockfishEngineService({ workerFactory: factory });
      await service.initialize();
      const result = await service.analyzePosition(testCase.fen, { depth: 6 });
      expect(result.bestMove).toBe(testCase.move);
      expect(result.bestMoveSan).toContain(testCase.sanFragment);
      service.terminate();
    }
  });

  it("rejects an illegal engine best move", async () => {
    const { factory } = createMockWorkerFactory({
      onCommand(command, worker) {
        if (!command.startsWith("go ")) return;
        worker.emitLine(infoLine(START_FEN, { pv: "" }));
        worker.emitLine("bestmove e2e5");
      },
    });
    const service = new StockfishEngineService({ workerFactory: factory });
    await service.initialize();

    await expect(
      service.analyzePosition(START_FEN, { depth: 6 }),
    ).rejects.toMatchObject({
      code: "invalid-output",
      message: expect.stringContaining("illegal best move"),
    });
    service.terminate();
  });

  it("cancels a search without corrupting UCI state", async () => {
    const move = START_MOVE;
    const { factory, workers } = createMockWorkerFactory({
      onCommand(command, worker) {
        if (command === "go depth 12") {
          worker.emitLine(infoLine(START_FEN, { pv: move }));
        }
        if (command === "go depth 6") {
          worker.emitLine(infoLine(START_FEN, { pv: move }));
          worker.emitLine(`bestmove ${move}`);
        }
        if (command === "stop") {
          worker.emitLine(`bestmove ${move}`);
        }
      },
    });
    const service = new StockfishEngineService({ workerFactory: factory });
    await service.initialize();

    const pending = service.analyzePosition(START_FEN, { depth: 12 });
    await tick();
    await service.stop();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });

    expect(workers[0]?.sent).toContain("stop");
    expect(service.isReady()).toBe(true);

    const next = START_MOVE;
    const second = service.analyzePosition(START_FEN, { depth: 6 });
    await expect(second).resolves.toMatchObject({ bestMove: next });
    service.terminate();
  });

  it("handles worker failure and allows retry", async () => {
    const { factory, workers } = createMockWorkerFactory();
    const service = new StockfishEngineService({ workerFactory: factory });
    await service.initialize();

    const pending = service.analyzePosition(START_FEN, { depth: 6 });
    await tick();
    workers[0]?.emitError("worker crashed");
    await expect(pending).rejects.toThrow("worker crashed");
    expect(service.isReady()).toBe(false);

    await service.initialize();
    expect(service.isReady()).toBe(true);
    expect(workers).toHaveLength(2);
    service.terminate();
  });

  it("terminates the worker", async () => {
    const { factory, workers } = createMockWorkerFactory();
    const service = new StockfishEngineService({ workerFactory: factory });
    await service.initialize();
    service.terminate();

    expect(workers[0]?.terminated).toBe(true);
    expect(service.isReady()).toBe(false);
    expect(service.isTerminated()).toBe(true);
  });

  it("runs multiple sequential searches on the same worker", async () => {
    const move = START_MOVE;
    const { factory, workers } = createMockWorkerFactory({
      onCommand(command, worker) {
        if (!command.startsWith("go ")) return;
        worker.emitLine(infoLine(START_FEN, { pv: move }));
        worker.emitLine(`bestmove ${move}`);
      },
    });
    const service = new StockfishEngineService({ workerFactory: factory });
    await service.initialize();

    await service.analyzePosition(START_FEN, { depth: 6 });
    await service.analyzePosition(START_FEN, { depth: 10 });

    expect(workers).toHaveLength(1);
    expect(workers[0]?.sent.filter((command) => command === "ucinewgame")).toHaveLength(2);
    expect(workers[0]?.sent).toContain("go depth 10");
    service.terminate();
  });
});
