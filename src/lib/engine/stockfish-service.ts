import {
  assertValidFen,
  sideToMove,
  validateUciMove,
  validateVariation,
  type ValidatedUciMove,
} from "./chess-moves";
import { EngineError } from "./errors";
import type {
  EngineEvaluation,
  EngineIdentity,
  EngineSearchProgress,
  EngineService,
  EngineStatusEvent,
  EngineWdl,
} from "./types";
import {
  isReadyOk,
  isUciOk,
  normalizeScore,
  parseBestMove,
  parseIdAuthor,
  parseIdName,
  parseUciInfo,
  parseVersion,
  type UciInfo,
} from "./uci";
import {
  UciWorkerTransport,
  type WorkerFactory,
} from "./worker-transport";

const DEFAULT_DEPTH = 15;
const READY_TIMEOUT_MS = 20_000;
const STOP_TIMEOUT_MS = 2_500;

interface ActiveSearch {
  id: number;
  fen: string;
  depth: number;
  multiPv: number;
  resolve: (value: EngineEvaluation) => void;
  reject: (error: unknown) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
  latestInfo?: UciInfo;
  aborted: boolean;
  stopResolve?: () => void;
  timeout?: ReturnType<typeof setTimeout>;
}

interface ReadyWaiter {
  resolve: () => void;
  reject: (error: EngineError) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface StockfishServiceOptions {
  workerFactory?: WorkerFactory;
  workerUrl?: string;
  readyTimeoutMs?: number;
  stopTimeoutMs?: number;
  /** Enables UCI_ShowWDL during initialization when supported by the engine. */
  showWdl?: boolean;
}

function abortError(): DOMException {
  return new DOMException("Engine search stopped", "AbortError");
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isInteger(value) && value > 0
    ? value
    : fallback;
}

export class StockfishEngineService implements EngineService {
  private transport: UciWorkerTransport | null = null;
  private readonly listeners = new Set<(event: EngineStatusEvent) => void>();
  private identity: EngineIdentity = { name: "Stockfish" };
  private ready = false;
  private sawUciOk = false;
  private initializing: Promise<void> | null = null;
  private readonly readyWaiters: ReadyWaiter[] = [];
  private active: ActiveSearch | null = null;
  private stopping: Promise<void> | null = null;
  private searchQueue: Promise<void> = Promise.resolve();
  private terminated = false;
  private requestCounter = 0;

  constructor(private readonly options: StockfishServiceOptions = {}) {}

  subscribe(listener: (event: EngineStatusEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  isReady(): boolean {
    return this.ready && !this.terminated && this.transport !== null;
  }

  isTerminated(): boolean {
    return this.terminated;
  }

  getIdentity(): EngineIdentity {
    return { ...this.identity };
  }

  async initialize(): Promise<void> {
    if (this.terminated) {
      throw new EngineError(
        "initialization-failed",
        "This engine instance has been terminated.",
      );
    }
    if (this.isReady()) return;
    if (this.initializing) return this.initializing;

    this.emit({ type: "initializing" });
    this.initializing = this.initializeWorker().finally(() => {
      this.initializing = null;
    });
    return this.initializing;
  }

  private async initializeWorker(): Promise<void> {
    this.disposeTransport();
    this.ready = false;
    this.sawUciOk = false;
    this.identity = { name: "Stockfish" };
    this.rejectReadyWaiters(
      new EngineError("initialization-failed", "Engine initialization restarted."),
    );

    let transport: UciWorkerTransport;
    try {
      transport = new UciWorkerTransport(
        this.options.workerFactory,
        this.options.workerUrl,
      );
      transport.start({
        onLine: (line) => this.handleLine(line),
        onProgress: (progress) => this.emit({ type: "downloading", progress }),
        onError: (error) => this.handleWorkerError(error),
      });
    } catch (error) {
      this.emitFailure(error);
      throw error;
    }
    this.transport = transport;

    const ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.readyWaiters.findIndex((waiter) => waiter.resolve === resolve);
        if (index >= 0) this.readyWaiters.splice(index, 1);
        reject(
          new EngineError(
            "initialization-failed",
            "Stockfish did not become ready in time. You can retry engine loading.",
          ),
        );
      }, this.options.readyTimeoutMs ?? READY_TIMEOUT_MS);
      this.readyWaiters.push({ resolve, reject, timer });
    });

    try {
      transport.send("uci");
      // UCI_ShowWDL is supported by the bundled Stockfish 19 Lite build. It is
      // set before isready so the first search already emits WDL information.
      if (this.options.showWdl !== false) {
        transport.send("setoption name UCI_ShowWDL value true");
      }
      transport.send("isready");
      await ready;
      this.ready = true;
      this.emit({ type: "ready", engine: this.getIdentity() });
    } catch (error) {
      this.disposeTransport();
      this.ready = false;
      this.emitFailure(error);
      throw error;
    }
  }

  analyzePosition(
    fen: string,
    options: {
      depth?: number;
      moveTimeMs?: number;
      multiPv?: number;
      signal?: AbortSignal;
    } = {},
  ): Promise<EngineEvaluation> {
    const run = this.searchQueue.then(
      () => this.startAnalysis(fen, options),
      () => this.startAnalysis(fen, options),
    );
    this.searchQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async startAnalysis(
    fen: string,
    options: {
      depth?: number;
      moveTimeMs?: number;
      multiPv?: number;
      signal?: AbortSignal;
    },
  ): Promise<EngineEvaluation> {
    if (this.terminated) {
      throw new EngineError("worker-error", "The engine has been terminated.");
    }
    assertValidFen(fen);
    if (!this.isReady()) await this.initialize();
    if (this.active || this.stopping) await this.stop();
    if (options.signal?.aborted) throw abortError();

    const depth = positiveInteger(options.depth, DEFAULT_DEPTH);
    const multiPv = positiveInteger(options.multiPv, 1);
    const moveTimeMs =
      options.moveTimeMs !== undefined && options.moveTimeMs > 0
        ? Math.trunc(options.moveTimeMs)
        : undefined;
    const id = ++this.requestCounter;

    return new Promise<EngineEvaluation>((resolve, reject) => {
      const search: ActiveSearch = {
        id,
        fen: fen.trim(),
        depth,
        multiPv,
        resolve,
        reject,
        signal: options.signal,
        aborted: false,
      };
      this.active = search;

      if (options.signal) {
        search.onAbort = () => {
          void this.stop().catch(() => undefined);
        };
        options.signal.addEventListener("abort", search.onAbort, { once: true });
      }

      const goCommand = moveTimeMs
        ? `go movetime ${moveTimeMs}`
        : `go depth ${depth}`;
      try {
        const transport = this.transport;
        if (!transport) throw new EngineError("worker-error", "Engine worker is missing.");
        transport.send("ucinewgame");
        transport.send(`setoption name MultiPV value ${multiPv}`);
        transport.send(`position fen ${search.fen}`);
        transport.send(goCommand);
        this.emit({ type: "searching", progress: this.progressFor(search) });
      } catch (error) {
        this.cleanupSearch(search);
        reject(error);
      }
    });
  }

  async stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    const search = this.active;
    if (!search) return;

    this.stopping = new Promise<void>((resolve) => {
      search.aborted = true;
      search.stopResolve = resolve;
      search.timeout = setTimeout(() => {
        if (this.active === search) {
          this.active = null;
          this.disposeTransport();
        }
        this.cleanupSearch(search);
        search.reject(
          new EngineError(
            "stop-timeout",
            "Stockfish did not stop in time; the worker was reset.",
          ),
        );
        resolve();
      }, this.options.stopTimeoutMs ?? STOP_TIMEOUT_MS);

      try {
        this.transport?.send("stop");
      } catch {
        resolve();
      }
    }).finally(() => {
      this.stopping = null;
    });

    await this.stopping;
    this.emit({ type: "stopped" });
  }

  terminate(): void {
    if (this.terminated) return;
    this.terminated = true;
    this.rejectReadyWaiters(
      new EngineError("worker-error", "The engine was terminated."),
    );
    if (this.active) {
      const search = this.active;
      this.active = null;
      this.cleanupSearch(search);
      search.aborted = true;
      search.reject(new EngineError("worker-error", "The engine was terminated."));
      search.stopResolve?.();
    }
    this.disposeTransport();
    this.listeners.clear();
  }

  private handleLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    if (isUciOk(trimmed)) {
      this.sawUciOk = true;
      return;
    }
    if (isReadyOk(trimmed)) {
      if (this.sawUciOk) this.resolveReadyWaiters();
      return;
    }

    const name = parseIdName(trimmed);
    if (name) {
      this.identity = {
        ...this.identity,
        name,
        version: parseVersion(name) ?? this.identity.version,
      };
      return;
    }
    const author = parseIdAuthor(trimmed);
    if (author) {
      this.identity = { ...this.identity, author };
      return;
    }

    if (trimmed.startsWith("info")) {
      const info = parseUciInfo(trimmed);
      if (info) this.handleInfo(info);
      return;
    }

    const bestMove = parseBestMove(trimmed);
    if (bestMove) this.finishSearch(bestMove.move);
  }

  private handleInfo(info: UciInfo): void {
    const search = this.active;
    if (!search) return;
    const current = search.latestInfo;
    const candidateIndex = info.multipv ?? 1;
    const currentIndex = current?.multipv ?? 1;
    const isBetter =
      !current ||
      candidateIndex < currentIndex ||
      (candidateIndex === currentIndex && (info.depth ?? 0) >= (current.depth ?? 0));
    if (isBetter) search.latestInfo = info;
    this.emit({ type: "searching", progress: this.progressFor(search) });
  }

  private finishSearch(bestMove: string | null): void {
    const search = this.active;
    if (!search) return;
    this.active = null;
    if (search.timeout) clearTimeout(search.timeout);
    this.cleanupSearch(search);

    if (search.aborted) {
      search.reject(abortError());
      search.stopResolve?.();
      return;
    }

    try {
      const info = search.latestInfo;
      if (!info?.score) {
        throw new EngineError(
          "invalid-output",
          "Stockfish finished without a usable evaluation.",
        );
      }
      let validated: ValidatedUciMove | null = null;
      if (bestMove) {
        validated = validateUciMove(search.fen, bestMove);
        if (!validated) {
          throw new EngineError(
            "invalid-output",
            `Stockfish returned an illegal best move: ${bestMove}`,
          );
        }
      }
      search.resolve(this.buildEvaluation(search, info, validated));
    } catch (error) {
      search.reject(error);
    }
    search.stopResolve?.();
  }

  private buildEvaluation(
    search: ActiveSearch,
    info: UciInfo,
    bestMove: ValidatedUciMove | null,
  ): EngineEvaluation {
    const score = normalizeScore(info.score!, sideToMove(search.fen));
    const variation = validateVariation(search.fen, info.pv);
    const depth = info.depth ?? search.depth;
    const wdl: EngineWdl | undefined = info.wdl ? { ...info.wdl } : undefined;
    return {
      fen: search.fen,
      depth,
      score: score.kind === "cp" ? (score.centipawns ?? 0) / 100 : null,
      ...(score.kind === "mate" ? { mate: score.mate } : {}),
      ...(bestMove
        ? { bestMove: bestMove.uci, bestMoveSan: bestMove.san }
        : {}),
      ...(wdl ? { wdl } : {}),
      principalVariation: variation.uci,
      principalVariationSan: variation.san,
      engine: this.getIdentity(),
      evaluation: score,
      stats: {
        depth,
        selectiveDepth: info.selectiveDepth,
        multiPv: info.multipv ?? search.multiPv,
        nodes: info.nodes,
        nps: info.nps,
        hashfull: info.hashfull,
        timeMs: info.timeMs,
      },
      rawInfo: info.raw,
    };
  }

  private progressFor(search: ActiveSearch): EngineSearchProgress {
    const info = search.latestInfo;
    const depth = info?.depth ?? 0;
    const stats = {
      depth,
      selectiveDepth: info?.selectiveDepth,
      multiPv: info?.multipv ?? search.multiPv,
      nodes: info?.nodes,
      nps: info?.nps,
      hashfull: info?.hashfull,
      timeMs: info?.timeMs,
    };
    return {
      fen: search.fen,
      depth,
      ...(info?.score
        ? { evaluation: normalizeScore(info.score, sideToMove(search.fen)) }
        : {}),
      ...(info?.pv.length ? { principalVariation: info.pv } : {}),
      stats,
    };
  }

  private cleanupSearch(search: ActiveSearch): void {
    if (search.timeout) clearTimeout(search.timeout);
    if (search.signal && search.onAbort) {
      search.signal.removeEventListener("abort", search.onAbort);
    }
    search.onAbort = undefined;
  }

  private handleWorkerError(error: EngineError): void {
    this.emit({ type: "error", message: error.message });
    const search = this.active;
    if (search) {
      this.active = null;
      this.cleanupSearch(search);
      search.aborted = true;
      search.reject(error);
      search.stopResolve?.();
    }
    this.rejectReadyWaiters(error);
    this.disposeTransport();
    this.ready = false;
  }

  private resolveReadyWaiters(): void {
    while (this.readyWaiters.length) {
      const waiter = this.readyWaiters.shift();
      if (!waiter) break;
      clearTimeout(waiter.timer);
      waiter.resolve();
    }
  }

  private rejectReadyWaiters(error: EngineError): void {
    while (this.readyWaiters.length) {
      const waiter = this.readyWaiters.shift();
      if (!waiter) break;
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }

  private emitFailure(error: unknown): void {
    const message =
      error instanceof Error ? error.message : "The engine failed unexpectedly.";
    this.emit({ type: "error", message });
  }

  private disposeTransport(): void {
    this.transport?.terminate();
    this.transport = null;
    this.ready = false;
  }

  private emit(event: EngineStatusEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // A broken UI listener must never break engine protocol handling.
      }
    }
  }
}
