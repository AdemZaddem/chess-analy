import { Chess } from "chess.js";
import type { WorkerFactory, WorkerLike } from "@/lib/engine/worker-transport";

type Listener = (event: never) => void;

/** Deterministic Worker stand-in that speaks the same string UCI protocol. */
export class MockEngineWorker implements WorkerLike {
  readonly sent: string[] = [];
  terminated = false;
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(
    readonly url: string,
    private readonly responder?: (command: string, worker: MockEngineWorker) => void,
  ) {}

  postMessage(message: unknown, transfer?: unknown[]): void {
    void transfer;
    const command = String(message);
    this.sent.push(command);
    this.responder?.(command, this);
  }

  addEventListener(type: string, listener: Listener): void {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  terminate(): void {
    this.terminated = true;
  }

  emitLine(line: string): void {
    this.dispatch("message", { data: line } as never);
  }

  emitProgress(progress: {
    percent: number;
    loaded: number;
    total: number;
  }): void {
    this.dispatch("message", { data: progress } as never);
  }

  emitError(message: string): void {
    this.dispatch("error", { message } as never);
  }

  private dispatch(type: string, event: never): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

export interface MockFactoryResult {
  factory: WorkerFactory;
  workers: MockEngineWorker[];
}

export interface MockFactoryOptions {
  onCommand?: (command: string, worker: MockEngineWorker) => void;
}

export function createMockWorkerFactory(
  options: MockFactoryOptions = {},
): MockFactoryResult {
  const workers: MockEngineWorker[] = [];
  return {
    workers,
    factory: (url) => {
      const worker = new MockEngineWorker(url, (command, current) => {
        if (command === "uci") {
          current.emitLine("id name Stockfish 19 Lite WASM");
          current.emitLine("id author the Stockfish developers");
          current.emitLine("option name Threads type spin default 1 min 1 max 1");
          current.emitLine("uciok");
          return;
        }
        if (command === "isready") {
          current.emitLine("readyok");
          return;
        }
        options.onCommand?.(command, current);
      });
      workers.push(worker);
      return worker;
    },
  };
}

export function legalUciMove(fen: string, predicate?: (san: string) => boolean): string {
  const moves = new Chess(fen).moves({ verbose: true });
  const move = predicate ? moves.find((candidate) => predicate(candidate.san)) : moves[0];
  if (!move) throw new Error(`No matching legal move for FEN: ${fen}`);
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}
