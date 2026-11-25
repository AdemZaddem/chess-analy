/** @vitest-environment jsdom */
import * as React from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { AnalysisWorkspace } from "@/components/analysis-workspace";
import { createAnalysisSettings } from "@/lib/analysis/settings";
import {
  createBundleFromGame,
  createReviewBundle,
  serializeReviewBundle,
} from "@/lib/export/review-bundle";
import { saveGameReview } from "@/lib/storage/review-store";
import { MemoryReviewStore } from "@/lib/storage/review-store";
import { createReviewRecord } from "@/lib/storage/schema";
import { CHECKMATE_PGN, STANDARD_PGN } from "./fixtures";
import { completeAnalysis, deterministicGame } from "./phase6-test-helpers";

vi.mock("next/dynamic", () => ({
  default: () => {
    function BoardStub() {
      return React.createElement("div", { "data-testid": "chessboard" });
    }
    return BoardStub;
  },
}));

const settings = createAnalysisSettings("standard");

async function pastePgnAndImport(): Promise<void> {
  fireEvent.click(screen.getByRole("tab", { name: "Paste PGN" }));
  fireEvent.change(screen.getByLabelText("PGN notation"), {
    target: { value: STANDARD_PGN },
  });
  fireEvent.click(screen.getByRole("button", { name: "Analyze PGN" }));
  await screen.findByRole("heading", { name: "Alice vs Bob" });
}

beforeEach(() => {
  if (typeof File !== "undefined" && !File.prototype.text) {
    Object.defineProperty(File.prototype, "text", {
      configurable: true,
      value(this: File) {
        return Promise.resolve(new Blob([this]).text());
      },
    });
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("Phase 6 saved-review, share and export UI", () => {
  it("saves an imported game and restores it after a fresh mount", async () => {
    const store = new MemoryReviewStore();
    const first = render(<AnalysisWorkspace store={store} />);
    await pastePgnAndImport();
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain(
        "saved in this browser",
      ),
    );
    const records = await store.list();
    expect(records).toHaveLength(1);
    first.unmount();

    render(<AnalysisWorkspace store={store} />);
    const savedNav = await screen.findByRole("button", {
      name: `My reviews (${records.length})`,
    });
    fireEvent.click(savedNav);
    expect(screen.getByTestId("saved-reviews")).toBeTruthy();
    fireEvent.click(screen.getByTestId(`open-review-${records[0]!.id}`));

    await screen.findByRole("heading", { name: "Alice vs Bob" });
    expect(screen.getByRole("status").textContent).toContain(
      "Saved game restored",
    );
    expect(screen.getByRole("button", { name: "Analyze full game" })).toBeTruthy();
  });

  it("opens a completed saved review without rerunning analysis", async () => {
    const store = new MemoryReviewStore();
    const game = deterministicGame();
    const analysis = await completeAnalysis(game, settings);
    await saveGameReview(store, { game, settings, analysis });

    render(<AnalysisWorkspace store={store} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "My reviews (1)" }),
    );
    fireEvent.click(screen.getByTestId(`open-review-${game.id}`));

    await screen.findByText("Review summary");
    expect(screen.getByRole("status").textContent).toContain(
      "restored without rerunning analysis",
    );
    expect(screen.getByRole("button", { name: "Analyze again" })).toBeTruthy();
  });

  it("copies a share link and opens it locally in a fresh workspace", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    const sender = render(<AnalysisWorkspace store={new MemoryReviewStore()} />);
    await pastePgnAndImport();
    fireEvent.click(screen.getByRole("button", { name: "Copy share link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const url = String(writeText.mock.calls[0]![0]);
    expect(url).toContain("#review=v1.");
    expect(url).not.toContain("analysis");
    sender.unmount();

    window.history.replaceState(null, "", `/${new URL(url).hash}`);
    const recipient = render(
      <AnalysisWorkspace store={new MemoryReviewStore()} />,
    );
    await screen.findByRole("heading", { name: "Alice vs Bob" });
    expect(screen.getByRole("status").textContent).toContain(
      "Shared game loaded locally",
    );
    expect(screen.getByRole("button", { name: "Analyze full game" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Analyze again" })).toBeNull();
    recipient.unmount();
  });

  it("imports a review file and rejects malformed review files", async () => {
    const store = new MemoryReviewStore();
    const game = deterministicGame();
    const text = serializeReviewBundle(
      createBundleFromGame({ game, settings }),
    );
    render(<AnalysisWorkspace store={store} />);

    fireEvent.click(screen.getByRole("tab", { name: "Review file" }));
    const input = screen.getByLabelText("Choose a MoveLens review file");
    fireEvent.change(input, {
      target: {
        files: [new File([text], "review.json", { type: "application/json" })],
      },
    });

    await screen.findByRole("heading", { name: "Alice vs Bob" });
    expect(screen.getByRole("status").textContent).toContain(
      "Game imported from review file",
    );
    expect(await store.list()).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Import another" }));
    fireEvent.click(screen.getByRole("tab", { name: "Review file" }));
    fireEvent.change(screen.getByLabelText("Choose a MoveLens review file"), {
      target: {
        files: [new File(["{bad"], "bad.json", { type: "application/json" })],
      },
    });
    await screen.findByText(/not valid JSON/);
  });

  it("deletes one saved game and clears the rest after confirmation", async () => {
    const store = new MemoryReviewStore();
    await saveGameReview(store, {
      game: deterministicGame(STANDARD_PGN),
      settings,
    });
    await saveGameReview(store, {
      game: deterministicGame(CHECKMATE_PGN),
      settings,
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<AnalysisWorkspace store={store} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "My reviews (2)" }),
    );
    expect(screen.getAllByTestId(/^open-review-/)).toHaveLength(2);

    fireEvent.click(
      screen.getAllByRole("button", { name: /Delete saved game/ })[0]!,
    );
    await waitFor(() => expect(store.list()).resolves.toHaveLength(1));

    fireEvent.click(
      screen.getByRole("button", { name: "Clear all saved games" }),
    );
    expect(screen.getByText("Delete all saved games?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Yes, clear all" }));
    await screen.findByText("No saved reviews yet");
    expect(await store.list()).toHaveLength(0);
    expect(confirm).toHaveBeenCalled();
  });

  it("keeps the existing review when a conflicting bundle import is cancelled", async () => {
    const store = new MemoryReviewStore();
    const game = deterministicGame();
    const analysis = await completeAnalysis(game, settings);
    const existing = await saveGameReview(store, { game, settings, analysis });
    const imported = createReviewBundle(
      createReviewRecord({
        game,
        settings: createAnalysisSettings("quick"),
        createdAt: existing.createdAt - 10_000,
        updatedAt: existing.updatedAt - 5_000,
        lastAccessedAt: existing.lastAccessedAt - 5_000,
      }),
    );
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<AnalysisWorkspace store={store} />);
    fireEvent.click(screen.getByRole("tab", { name: "Review file" }));
    fireEvent.change(screen.getByLabelText("Choose a MoveLens review file"), {
      target: {
        files: [
          new File([serializeReviewBundle(imported)], "older.json", {
            type: "application/json",
          }),
        ],
      },
    });

    await screen.findByText("Import cancelled. The existing saved review was kept.");
    const kept = await store.get(existing.id);
    expect(kept.analysisState).toBe("complete");
    expect(kept.settings).toEqual(settings);
    expect(kept.updatedAt).toBe(existing.updatedAt);
    expect(kept.analysis?.identity.key).toBe(analysis.identity.key);
    expect(confirm).toHaveBeenCalled();
    expect(confirm.mock.calls[0]![0]).toContain("Choose Cancel to keep the existing review.");
    expect(screen.queryByRole("heading", { name: "Alice vs Bob" })).toBeNull();
  });

  it("replaces a conflicting bundle after confirmation and preserves its timestamps", async () => {
    const store = new MemoryReviewStore();
    const game = deterministicGame();
    await saveGameReview(store, { game, settings });
    const importedSettings = createAnalysisSettings("quick");
    const importedAnalysis = await completeAnalysis(game, importedSettings);
    const imported = createReviewBundle(
      createReviewRecord({
        game,
        settings: importedSettings,
        analysis: importedAnalysis,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_100_000,
        lastAccessedAt: 1_700_000_200_000,
      }),
    );
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<AnalysisWorkspace store={store} />);
    fireEvent.click(screen.getByRole("tab", { name: "Review file" }));
    fireEvent.change(screen.getByLabelText("Choose a MoveLens review file"), {
      target: {
        files: [
          new File([serializeReviewBundle(imported)], "review.json", {
            type: "application/json",
          }),
        ],
      },
    });

    await screen.findByRole("heading", { name: "Alice vs Bob" });
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain(
        "Review imported with its completed analysis.",
      ),
    );
    const replaced = await store.get(game.id);
    expect(replaced.settings).toEqual(importedSettings);
    expect(replaced.createdAt).toBe(imported.review.createdAt);
    expect(replaced.updatedAt).toBe(imported.review.updatedAt);
    expect(replaced.lastAccessedAt).toBe(imported.review.lastAccessedAt);
    expect(replaced.analysis?.identity.key).toBe(importedAnalysis.identity.key);
    expect(confirm).toHaveBeenCalled();
  });

  it("does not prompt for a newer bundle with matching settings and completeness", async () => {
    const store = new MemoryReviewStore();
    const game = deterministicGame();
    await saveGameReview(store, { game, settings });
    const imported = createReviewBundle(
      createReviewRecord({
        game,
        settings,
        createdAt: 1_700_000_000_000,
        updatedAt: Date.now() + 60_000,
        lastAccessedAt: Date.now() + 60_000,
      }),
    );
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<AnalysisWorkspace store={store} />);
    fireEvent.click(screen.getByRole("tab", { name: "Review file" }));
    fireEvent.change(screen.getByLabelText("Choose a MoveLens review file"), {
      target: {
        files: [
          new File([serializeReviewBundle(imported)], "newer.json", {
            type: "application/json",
          }),
        ],
      },
    });

    await screen.findByRole("heading", { name: "Alice vs Bob" });
    expect(confirm).not.toHaveBeenCalled();
    expect((await store.get(game.id)).updatedAt).toBe(imported.review.updatedAt);
  });
});
