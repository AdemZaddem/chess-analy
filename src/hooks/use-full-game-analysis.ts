"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FullGameAnalysisRunner } from "@/lib/analysis/full-game-service";
import {
  analysisErrorMessage,
  isCancellationError,
} from "@/lib/analysis/errors";
import { createAnalysisIdentity } from "@/lib/analysis/settings";
import type {
  AnalysisSettings,
  FullGameAnalysis,
  FullGameProgress,
  FullGameRunStatus,
} from "@/lib/analysis/types";
import type { NormalizedGame } from "@/lib/chess/types";
import { acquireSharedEngine, type SharedEngineHandle } from "@/lib/engine/shared-engine";

export interface UseFullGameAnalysisResult {
  status: FullGameRunStatus;
  isRunning: boolean;
  isAnalyzing: boolean;
  progress: FullGameProgress | null;
  result: FullGameAnalysis | null;
  error: string | null;
  analyze: (settings?: AnalysisSettings) => Promise<void>;
  cancel: () => Promise<void>;
  clear: () => void;
}

export function useFullGameAnalysis(
  game: NormalizedGame,
  settings: AnalysisSettings,
): UseFullGameAnalysisResult {
  const [status, setStatus] = useState<FullGameRunStatus>("idle");
  const [progress, setProgress] = useState<FullGameProgress | null>(null);
  const [result, setResult] = useState<FullGameAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(false);
  const handleRef = useRef<SharedEngineHandle | null>(null);
  const runnerRef = useRef<FullGameAnalysisRunner | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const expectedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    const handle = acquireSharedEngine();
    handleRef.current = handle;
    runnerRef.current = new FullGameAnalysisRunner(handle.service);

    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      controllerRef.current?.abort();
      controllerRef.current = null;
      void handle.service.stop?.().catch(() => undefined);
      handle.release();
      handleRef.current = null;
      runnerRef.current = null;
    };
  }, []);

  /**
   * The production UI keys the component that owns this hook by this value,
   * so a game/settings switch unmounts the old analysis. This cleanup is a
   * second line of defence: it invalidates any in-flight run that somehow
   * outlives a key change.
   */
  const analysisKey = createAnalysisIdentity(game, settings).key;
  useEffect(() => {
    return () => {
      generationRef.current += 1;
      controllerRef.current?.abort();
      controllerRef.current = null;
      expectedKeyRef.current = null;
    };
  }, [analysisKey]);

  const analyze = useCallback(
    async (settingsOverride?: AnalysisSettings) => {
      const runner = runnerRef.current;
      const handle = handleRef.current;
      if (!runner || !handle || !mountedRef.current) return;
      if (runner.isRunning()) return;

      const activeSettings = settingsOverride ?? settings;
      const identity = createAnalysisIdentity(game, activeSettings);
      const generation = generationRef.current;
      const controller = new AbortController();
      controllerRef.current = controller;
      expectedKeyRef.current = identity.key;

      setError(null);
      setResult(null);
      setStatus("initializing");
      setProgress(null);

      try {
        const analysis = await runner.analyze({
          game,
          settings: activeSettings,
          signal: controller.signal,
          onProgress: (next) => {
            if (!mountedRef.current || generation !== generationRef.current) return;
            setProgress(next);
            setStatus(next.status);
          },
        });
        if (
          !mountedRef.current ||
          generation !== generationRef.current ||
          expectedKeyRef.current !== identity.key ||
          analysis.identity.key !== identity.key
        ) {
          return;
        }
        setResult(analysis);
        setStatus("complete");
      } catch (analysisError) {
        if (!mountedRef.current || generation !== generationRef.current) return;
        if (isCancellationError(analysisError)) {
          setStatus("cancelled");
          setError(null);
          return;
        }
        setStatus("error");
        setError(analysisErrorMessage(analysisError));
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
      }
    },
    [game, settings],
  );

  const cancel = useCallback(async () => {
    controllerRef.current?.abort();
    setStatus("stopping");
    try {
      await handleRef.current?.service.stop?.();
    } catch (stopError) {
      if (!isCancellationError(stopError) && mountedRef.current) {
        setError(analysisErrorMessage(stopError));
      }
    }
  }, []);

  const clear = useCallback(() => {
    generationRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    expectedKeyRef.current = null;
    setStatus("idle");
    setProgress(null);
    setResult(null);
    setError(null);
  }, []);

  return {
    status,
    isRunning:
      status === "initializing" || status === "analyzing" || status === "stopping",
    isAnalyzing: status === "analyzing",
    progress,
    result,
    error,
    analyze,
    cancel,
    clear,
  };
}
