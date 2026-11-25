"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { acquireSharedEngine } from "@/lib/engine/shared-engine";
import type { StockfishEngineService } from "@/lib/engine/stockfish-service";
import type {
  EngineAnalysisOptions,
  EngineDownloadProgress,
  EngineEvaluation,
  EngineIdentity,
  EngineSearchProgress,
} from "@/lib/engine/types";

export type EngineUiStatus =
  | "idle"
  | "loading"
  | "ready"
  | "searching"
  | "stopping"
  | "error";

export interface UseEngineAnalysisResult {
  status: EngineUiStatus;
  isLoading: boolean;
  isSearching: boolean;
  identity: EngineIdentity | null;
  downloadProgress: EngineDownloadProgress | null;
  searchProgress: EngineSearchProgress | null;
  result: EngineEvaluation | null;
  error: string | null;
  initialize: () => Promise<void>;
  analyze: (options?: Omit<EngineAnalysisOptions, "signal">) => Promise<void>;
  stop: () => Promise<void>;
  clear: () => void;
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : "The engine failed unexpectedly.";
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** Bridges the shared worker-backed service to one React position viewer. */
export function useEngineAnalysis(fen: string): UseEngineAnalysisResult {
  const [status, setStatus] = useState<EngineUiStatus>("idle");
  const [identity, setIdentity] = useState<EngineIdentity | null>(null);
  const [downloadProgress, setDownloadProgress] =
    useState<EngineDownloadProgress | null>(null);
  const [searchProgress, setSearchProgress] =
    useState<EngineSearchProgress | null>(null);
  const [result, setResult] = useState<EngineEvaluation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(false);
  const serviceRef = useRef<StockfishEngineService | null>(null);
  const activeFenRef = useRef(fen);
  const generationRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    const handle = acquireSharedEngine();
    const service = handle.service;
    serviceRef.current = service;

    const unsubscribe = service.subscribe((event) => {
      if (!mountedRef.current) return;
      switch (event.type) {
        case "initializing":
          setError(null);
          setStatus("loading");
          break;
        case "downloading":
          setDownloadProgress(event.progress);
          setStatus("loading");
          break;
        case "ready":
          setIdentity(event.engine);
          setError(null);
          setDownloadProgress(null);
          setStatus("ready");
          break;
        case "searching":
          if (event.progress.fen !== activeFenRef.current) return;
          setSearchProgress(event.progress);
          setStatus("searching");
          break;
        case "stopped":
          setSearchProgress(null);
          setStatus((current) =>
            current === "searching" || current === "stopping" ? "ready" : current,
          );
          break;
        case "error":
          setError(event.message);
          setStatus("error");
          break;
      }
    });

    if (service.isReady()) {
      queueMicrotask(() => {
        if (!mountedRef.current) return;
        setIdentity(service.getIdentity());
        setStatus("ready");
      });
    }

    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      controllerRef.current?.abort();
      controllerRef.current = null;
      unsubscribe();
      handle.release();
      serviceRef.current = null;
    };
  }, []);

  useEffect(() => {
    activeFenRef.current = fen;
    generationRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, [fen]);

  const initialize = useCallback(async () => {
    const service = serviceRef.current;
    if (!service) return;
    setError(null);
    setStatus("loading");
    try {
      await service.initialize();
      if (mountedRef.current) {
        setIdentity(service.getIdentity());
        setStatus("ready");
      }
    } catch (initError) {
      if (mountedRef.current) {
        setError(messageFrom(initError));
        setStatus("error");
      }
    }
  }, []);

  const analyze = useCallback(
    async (options: Omit<EngineAnalysisOptions, "signal"> = {}) => {
      const service = serviceRef.current;
      if (!service || !mountedRef.current) return;

      const requestedFen = fen;
      const generation = generationRef.current;
      const controller = new AbortController();
      controllerRef.current = controller;
      setError(null);
      setResult(null);
      setStatus(service.isReady() ? "searching" : "loading");

      try {
        const evaluation = await service.analyzePosition(requestedFen, {
          ...options,
          signal: controller.signal,
        });
        if (
          !mountedRef.current ||
          generation !== generationRef.current ||
          evaluation.fen !== activeFenRef.current
        ) {
          return;
        }
        setResult(evaluation);
        setSearchProgress(null);
        setStatus("ready");
      } catch (analysisError) {
        if (
          !mountedRef.current ||
          generation !== generationRef.current ||
          isAbort(analysisError)
        ) {
          return;
        }
        setError(messageFrom(analysisError));
        setStatus("error");
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
      }
    },
    [fen],
  );

  const stop = useCallback(async () => {
    const service = serviceRef.current;
    if (!service) return;
    setStatus("stopping");
    controllerRef.current?.abort();
    try {
      await service.stop?.();
    } catch (stopError) {
      if (!isAbort(stopError) && mountedRef.current) setError(messageFrom(stopError));
    } finally {
      if (mountedRef.current) {
        setSearchProgress(null);
        setStatus("ready");
      }
    }
  }, []);

  const clear = useCallback(() => {
    setResult(null);
    setSearchProgress(null);
    setError(null);
  }, []);

  return {
    status,
    isLoading: status === "loading" || status === "stopping",
    isSearching: status === "searching",
    identity,
    downloadProgress,
    searchProgress: searchProgress?.fen === fen ? searchProgress : null,
    result: result?.fen === fen ? result : null,
    error,
    initialize,
    analyze,
    stop,
    clear,
  };
}
