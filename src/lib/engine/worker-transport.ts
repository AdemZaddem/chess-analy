import { EngineError } from "./errors";
import type { EngineDownloadProgress } from "./types";

interface WorkerEventMap {
  message: MessageEvent;
  messageerror: MessageEvent;
  error: ErrorEvent;
}

/** Minimal Worker surface so tests can inject a deterministic fake. */
export interface WorkerLike {
  postMessage(message: unknown, transfer?: unknown[]): void;
  addEventListener<K extends keyof WorkerEventMap>(
    type: K,
    listener: (event: WorkerEventMap[K]) => void,
  ): void;
  removeEventListener?(type: string, listener: (event: never) => void): void;
  terminate(): void;
}

export interface WorkerTransportCallbacks {
  onLine: (line: string) => void;
  onProgress: (progress: EngineDownloadProgress) => void;
  onError: (error: EngineError) => void;
}

export type WorkerFactory = (url: string) => WorkerLike;

export const DEFAULT_ENGINE_WORKER_URL = "/engine/stockfish-19-lite-single.js";

export function createBrowserWorker(url: string): WorkerLike {
  if (typeof Worker === "undefined") {
    throw new EngineError(
      "worker-unavailable",
      "Web Workers are not available in this environment.",
    );
  }
  return new Worker(url) as unknown as WorkerLike;
}

export function isDownloadProgress(value: unknown): value is EngineDownloadProgress {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.percent === "number" &&
    typeof record.loaded === "number" &&
    typeof record.total === "number"
  );
}

export class UciWorkerTransport {
  private worker: WorkerLike | null = null;
  private callbacks: WorkerTransportCallbacks | null = null;
  private progressChannel: MessageChannel | null = null;
  private readonly onProgressMessage = (event: MessageEvent) => {
    this.handleProgress(event.data as unknown);
  };
  private readonly onMessage = (event: MessageEvent) => {
    const data: unknown = event.data;
    if (typeof data === "string") {
      this.callbacks?.onLine(data);
      return;
    }
    this.handleProgress(data);
  };
  private readonly onMessageError = () => {
    this.callbacks?.onError(
      new EngineError("worker-error", "The engine worker returned an unreadable message."),
    );
  };
  private readonly onError = (event: ErrorEvent) => {
    this.callbacks?.onError(
      new EngineError(
        "worker-error",
        event.message || "The engine worker failed unexpectedly.",
      ),
    );
  };

  constructor(
    private readonly factory: WorkerFactory = createBrowserWorker,
    private readonly url: string = DEFAULT_ENGINE_WORKER_URL,
    private readonly enableProgress: boolean = factory === createBrowserWorker,
  ) {}

  start(callbacks: WorkerTransportCallbacks): void {
    this.callbacks = callbacks;
    this.worker = this.factory(this.url);
    this.worker.addEventListener("message", this.onMessage);
    this.worker.addEventListener("messageerror", this.onMessageError);
    this.worker.addEventListener("error", this.onError);

    if (this.enableProgress && typeof MessageChannel !== "undefined") {
      const channel = new MessageChannel();
      this.progressChannel = channel;
      channel.port1.addEventListener("message", this.onProgressMessage);
      this.worker.postMessage({ progressPort: channel.port2 }, [channel.port2]);
      this.worker.postMessage("setoption name CanOutputEngineDownloadProgress");
    }
  }

  private handleProgress(data: unknown): void {
    if (!isDownloadProgress(data)) return;
    this.callbacks?.onProgress({
      percent: Math.max(0, Math.min(1, data.percent)),
      loaded: data.loaded,
      total: data.total,
      speedText: typeof data.speedText === "string" ? data.speedText : undefined,
      etaText: typeof data.etaText === "string" ? data.etaText : undefined,
    });
  }

  send(command: string): void {
    if (!this.worker) {
      throw new EngineError("worker-error", "The engine worker is not running.");
    }
    this.worker.postMessage(command);
  }

  terminate(): void {
    if (!this.worker) return;
    try {
      this.worker.removeEventListener?.("message", this.onMessage as never);
      this.worker.removeEventListener?.("messageerror", this.onMessageError as never);
      this.worker.removeEventListener?.("error", this.onError as never);
      this.worker.terminate();
    } finally {
      this.progressChannel?.port1.close();
      this.progressChannel?.port2.close();
      this.progressChannel = null;
      this.worker = null;
      this.callbacks = null;
    }
  }
}
