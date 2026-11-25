import { EngineError } from "./errors";
import { StockfishEngineService } from "./stockfish-service";
import type { WorkerFactory } from "./worker-transport";

const SHUTDOWN_DELAY_MS = 1_000;

let service: StockfishEngineService | null = null;
let references = 0;
let shutdownTimer: ReturnType<typeof setTimeout> | null = null;
let workerFactoryOverride: WorkerFactory | undefined;

export interface SharedEngineHandle {
  service: StockfishEngineService;
  release(): void;
}

/**
 * Overrides the worker factory for the next created service. Intended for
 * deterministic tests; production always uses the browser Worker constructor.
 */
export function setSharedEngineWorkerFactory(factory?: WorkerFactory): void {
  workerFactoryOverride = factory;
  if (service && !service.isReady()) {
    // A not-yet-ready service may still be initializing with the old factory.
    // Leave lifecycle cleanup to its owner; the next acquire creates a new one.
    service = null;
  }
}

/** Returns a ref-counted engine so React Strict Mode remounts reuse one worker. */
export function acquireSharedEngine(): SharedEngineHandle {
  if (typeof window === "undefined") {
    throw new EngineError(
      "worker-unavailable",
      "The chess engine can only be created in the browser.",
    );
  }

  if (shutdownTimer) {
    clearTimeout(shutdownTimer);
    shutdownTimer = null;
  }
  references += 1;
  if (!service || service.isTerminated()) {
    service = new StockfishEngineService(
      workerFactoryOverride ? { workerFactory: workerFactoryOverride } : {},
    );
  }

  const acquired = service;
  let released = false;
  return {
    service: acquired,
    release() {
      if (released) return;
      released = true;
      references -= 1;
      if (references > 0) return;
      shutdownTimer = setTimeout(() => {
        shutdownTimer = null;
        if (references > 0) return;
        acquired.terminate();
        if (service === acquired) service = null;
      }, SHUTDOWN_DELAY_MS);
    },
  };
}
