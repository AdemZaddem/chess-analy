import { describe, expect, it } from "vitest";
import { createAnalysisSettings } from "@/lib/analysis/settings";
import {
  buildReviewShareUrl,
  createReviewSharePayload,
  decodeReviewShareHash,
  encodeReviewShareHash,
  loadSharedReview,
  MAX_SHARE_DECOMPRESSED_BYTES,
  MAX_SHARE_URL_LENGTH,
  parseReviewSharePayload,
  ReviewShareError,
  settingsFromSharePayload,
} from "@/lib/share/review-share";
import type { ShareErrorCode } from "@/lib/share/review-share";
import { deterministicGame } from "./phase6-test-helpers";

const settings = createAnalysisSettings("standard");
const game = deterministicGame();
const payload = createReviewSharePayload(game, settings);

async function expectShareError(
  run: () => Promise<unknown>,
  code: ShareErrorCode,
): Promise<void> {
  try {
    await run();
    throw new Error("Expected ReviewShareError");
  } catch (error) {
    expect(error).toBeInstanceOf(ReviewShareError);
    expect((error as ReviewShareError).code).toBe(code);
  }
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

describe("Phase 6 privacy-friendly share links", () => {
  it("encodes the PGN and minimal settings into a plain URL fragment", async () => {
    const encoded = await encodeReviewShareHash(payload, { compress: false });
    expect(encoded.hash).toMatch(/^review=v1\.p\.[A-Za-z0-9_-]+$/);

    const decoded = await decodeReviewShareHash(`#${encoded.hash}`);
    expect(decoded.pgn).toBe(game.pgn);
    expect(decoded.preset).toBe("standard");
    expect(decoded.depth).toBe(settings.depth);
    expect(decoded.meta?.white).toBe("Alice");
    expect(decoded.source).toBeUndefined();
    expect(decoded).not.toHaveProperty("analysis");

    const share = await buildReviewShareUrl(payload, {
      baseUrl: "https://example.test/review",
      compress: false,
    });
    expect(share.url.startsWith("https://example.test/review#review=v1.")).toBe(true);
    expect(share.urlLength).toBe(share.url.length);
    expect(share.urlLength).toBeLessThan(MAX_SHARE_URL_LENGTH);
  });

  it("uses gzip when the browser exposes CompressionStream", async () => {
    if (typeof CompressionStream === "undefined") return;
    const encoded = await encodeReviewShareHash(payload);
    expect(encoded.encoding).toBe("gzip");
    const decoded = await decodeReviewShareHash(encoded.hash);
    expect(decoded.pgn).toBe(game.pgn);
  });

  it("reconstructs a local game without any analysis snapshot", async () => {
    const { hash } = await encodeReviewShareHash(payload, { compress: false });
    const loaded = await loadSharedReview(`#${hash}`);
    expect(loaded.game.pgn).toBe(game.pgn);
    expect(loaded.game.id).toBe(game.id);
    expect(loaded.settings.preset).toBe("standard");
    expect(loaded.game.warnings.join(" ")).toContain("Analysis is not included");
  });

  it("rejects malformed, unsupported and invalid payloads", async () => {
    await expectShareError(() => decodeReviewShareHash("#review=v1.p.%%%"), "invalid");
    await expectShareError(
      () => decodeReviewShareHash("#review=v2.p.AQID"),
      "unsupported-version",
    );
    await expectShareError(
      () =>
        decodeReviewShareHash("#review=v1.z.AQID"),
      "invalid",
    );

    const invalidJson = new TextEncoder().encode(
      JSON.stringify({ ...payload, pgn: "   " }),
    );
    const invalidHash = `review=v1.p.${base64Url(invalidJson)}`;
    await expectShareError(
      () => decodeReviewShareHash(`#${invalidHash}`),
      "invalid",
    );
    expect(() => parseReviewSharePayload({ ...payload, depth: 0 })).toThrow(
      ReviewShareError,
    );
  });

  it("refuses shared PGN files with multiple games", async () => {
    const twoGames = [
      '[Event "One"]',
      '[White "Alice"]',
      '[Black "Bob"]',
      "",
      "1. e4 *",
      "",
      '[Event "Two"]',
      '[White "Carol"]',
      '[Black "Dave"]',
      "",
      "1. d4 *",
    ].join("\n");
    const { hash } = await encodeReviewShareHash(
      { ...payload, pgn: twoGames },
      { compress: false },
    );
    await expectShareError(() => loadSharedReview(`#${hash}`), "invalid");
  });

  it("rejects oversized links and points users to export files", async () => {
    const oversized = await buildReviewShareUrl(
      { ...payload, pgn: "x".repeat(9_000) },
      { baseUrl: "https://example.test/", compress: false },
    ).catch((error: unknown) => error);
    expect(oversized).toBeInstanceOf(ReviewShareError);
    expect((oversized as ReviewShareError).code).toBe("too-large");
    expect((oversized as ReviewShareError).message).toContain("Export the review file");
    await expectShareError(
      () =>
        decodeReviewShareHash(
          `#review=v1.p.${"A".repeat(MAX_SHARE_URL_LENGTH)}`,
        ),
      "too-large",
    );
  });

  it("caps decompressed share payloads", async () => {
    if (typeof CompressionStream === "undefined") return;
    const hugeJson = new TextEncoder().encode(
      JSON.stringify({
        ...payload,
        pgn: "x".repeat(MAX_SHARE_DECOMPRESSED_BYTES + 1),
      }),
    );
    const compressed = await new Response(
      new Blob([hugeJson as BlobPart])
        .stream()
        .pipeThrough(new CompressionStream("gzip")),
    ).arrayBuffer();
    const hash = `review=v1.g.${base64Url(new Uint8Array(compressed))}`;
    expect(hash.length).toBeLessThan(MAX_SHARE_URL_LENGTH);
    await expectShareError(() => decodeReviewShareHash(`#${hash}`), "too-large");
  });

  it("maps shared presets back to local analysis settings", () => {
    expect(settingsFromSharePayload(payload)).toEqual(settings);
  });
});
