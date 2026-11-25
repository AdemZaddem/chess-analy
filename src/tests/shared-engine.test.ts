/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import {
  acquireSharedEngine,
  setSharedEngineWorkerFactory,
} from "@/lib/engine/shared-engine";
import { createMockWorkerFactory } from "./engine-mock-worker";

afterEach(() => {
  setSharedEngineWorkerFactory(undefined);
});

describe("shared engine lifecycle", () => {
  it("reuses one worker across Strict Mode-style remounts", async () => {
    const { factory, workers } = createMockWorkerFactory();
    setSharedEngineWorkerFactory(factory);

    const first = acquireSharedEngine();
    const second = acquireSharedEngine();
    await first.service.initialize();
    expect(workers).toHaveLength(1);

    first.release();
    const third = acquireSharedEngine();
    expect(third.service).toBe(first.service);

    await third.service.initialize();
    expect(workers).toHaveLength(1);

    second.release();
    third.release();
    await new Promise<void>((resolve) => setTimeout(resolve, 1_100));

    expect(workers[0]?.terminated).toBe(true);
  });
});
