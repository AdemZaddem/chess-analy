"use client";

import { useCallback, useState } from "react";
import { Check, Download, Link2, Share2 } from "lucide-react";
import { ErrorAlert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FullGameAnalysis, AnalysisSettings } from "@/lib/analysis/types";
import type { NormalizedGame } from "@/lib/chess/types";
import {
  createBundleFromGame,
  serializeReviewBundle,
} from "@/lib/export/review-bundle";
import {
  buildReviewShareUrl,
  createReviewSharePayload,
  ReviewShareError,
} from "@/lib/share/review-share";

interface GeneratedShare {
  url: string;
  encoding: string;
  length: number;
}

function describe(error: unknown): string {
  if (error instanceof ReviewShareError) return error.message;
  return error instanceof Error ? error.message : "Sharing is unavailable here.";
}

function reviewFilename(game: NormalizedGame): string {
  const white = game.metadata.white.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  const black = game.metadata.black.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  return `movelens-review-${white || "white"}-${black || "black"}.json`;
}

/**
 * Sharing and export stay deliberately distinct: links restore only a game,
 * while JSON bundles may carry the completed local analysis snapshot.
 */
export function ReviewActions({
  game,
  settings,
  analysis,
}: {
  game: NormalizedGame;
  settings: AnalysisSettings;
  analysis: FullGameAnalysis | null;
}) {
  const [share, setShare] = useState<GeneratedShare | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exported, setExported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (): Promise<GeneratedShare | null> => {
    setBusy(true);
    setError(null);
    try {
      const encoded = await buildReviewShareUrl(
        createReviewSharePayload(game, settings),
        { baseUrl: typeof window === "undefined" ? undefined : window.location.href },
      );
      const next = {
        url: encoded.url,
        encoding: encoded.encoding,
        length: encoded.urlLength,
      };
      setShare(next);
      return next;
    } catch (cause) {
      setError(describe(cause));
      return null;
    } finally {
      setBusy(false);
    }
  }, [game, settings]);

  const copy = useCallback(async () => {
    const link = share ?? (await generate());
    if (!link) return;
    try {
      if (!navigator.clipboard?.writeText) {
        setCopied(false);
        setError("Clipboard access is unavailable. Select the link below and copy it manually.");
        return;
      }
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setError(null);
    } catch {
      setCopied(false);
      setError("The browser blocked clipboard access. Select the link below and copy it manually.");
    }
  }, [generate, share]);

  const nativeShare = useCallback(async () => {
    const link = share ?? (await generate());
    if (!link) return;
    if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
      setError("Native sharing is unavailable here. Copy the generated link instead.");
      return;
    }
    try {
      await navigator.share({
        title: "Chess review",
        text: `${game.metadata.white.name} vs ${game.metadata.black.name}`,
        url: link.url,
      });
      setError(null);
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") return;
      setError(describe(cause));
    }
  }, [game.metadata.black.name, game.metadata.white.name, generate, share]);

  const exportReview = useCallback(() => {
    setError(null);
    try {
      const text = serializeReviewBundle(
        createBundleFromGame({ game, settings, analysis }),
      );
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = reviewFilename(game);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setExported(true);
    } catch (cause) {
      setError(describe(cause));
    }
  }, [analysis, game, settings]);

  return (
    <Card data-testid="review-actions">
      <CardHeader className="flex flex-wrap items-center justify-between gap-2 py-3">
        <CardTitle className="text-sm">Share &amp; export</CardTitle>
        <Badge variant="neutral">Local only</Badge>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        <p className="text-[11px] leading-relaxed text-muted">
          A link contains the PGN and settings in the URL fragment, not on a
          server. The recipient loads the game and analyzes it with their own
          engine. Export files can include this completed analysis.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void copy()}
            disabled={busy}
          >
            <Link2 className="size-3.5" aria-hidden />
            {copied ? "Copied" : "Copy share link"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void nativeShare()}
            disabled={busy}
          >
            <Share2 className="size-3.5" aria-hidden />
            Share
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={exportReview}
            data-testid="export-review"
          >
            <Download className="size-3.5" aria-hidden />
            {analysis ? "Export review" : "Export game"}
          </Button>
        </div>

        {share ? (
          <div className="space-y-1.5">
            <label htmlFor="share-url" className="text-[11px] uppercase tracking-wider text-muted">
              Share link · {share.encoding} · {share.length.toLocaleString()} characters
            </label>
            <input
              id="share-url"
              data-testid="share-url"
              readOnly
              value={share.url}
              onFocus={(event) => event.currentTarget.select()}
              className="w-full rounded-lg border border-line bg-canvas/70 px-2 py-1.5 font-mono text-[10px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            />
            <p role="status" className="flex items-center gap-1 text-[11px] text-accent">
              {copied ? <Check className="size-3" aria-hidden /> : null}
              {copied ? "Link copied to clipboard." : "Link ready; select it to copy manually."}
            </p>
          </div>
        ) : null}

        {exported ? (
          <p role="status" className="text-[11px] text-accent">
            Review file downloaded. Keep it to move this review to another browser.
          </p>
        ) : null}

        {error ? <ErrorAlert>{error}</ErrorAlert> : null}
      </CardContent>
    </Card>
  );
}
