"use client";

import { useRef, useState } from "react";
import {
  ArrowLeft,
  ClipboardPaste,
  FileText,
  Globe2,
  LoaderCircle,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorAlert } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { NormalizedGame } from "@/lib/chess/types";
import { ChesscomImportError } from "@/lib/chesscom/errors";
import { parseChesscomGameUrl } from "@/lib/chesscom/game-url";
import { normalizeChesscomUsername } from "@/lib/chesscom/username";
import { readPgnFile } from "@/lib/import/file-reading";
import { importChesscomGame } from "@/lib/import/chesscom-import-client";
import {
  importPgn,
  type PgnImportMultiple,
  type PgnImportSource,
} from "@/lib/import/pgn-import-service";
import { MultiGamePicker } from "./multi-game-picker";

type ImportTab = "file" | "text" | "chesscom";

const tabs: { id: ImportTab; label: string; icon: typeof Upload }[] = [
  { id: "file", label: "Upload file", icon: Upload },
  { id: "text", label: "Paste PGN", icon: ClipboardPaste },
  { id: "chesscom", label: "Chess.com", icon: Globe2 },
];

const fieldClass =
  "w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-muted focus-visible:border-accent/60 focus-visible:ring-2 focus-visible:ring-accent/30";

export function ImportPanel({
  onImport,
  onCancel,
}: {
  onImport: (game: NormalizedGame) => void;
  onCancel?: () => void;
}) {
  const [tab, setTab] = useState<ImportTab>("file");
  const [text, setText] = useState("");
  const [filename, setFilename] = useState<string | undefined>();
  const [gameUrl, setGameUrl] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [chesscomBusy, setChesscomBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [multiple, setMultiple] = useState<PgnImportMultiple | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function clearFeedback() {
    setError(null);
    setMultiple(null);
  }

  function runImport(
    content: string,
    source: PgnImportSource,
    gameIndex?: number,
  ) {
    clearFeedback();
    const result = importPgn(content, { source, gameIndex });

    if (result.status === "success") {
      onImport(result.game);
      return;
    }
    if (result.status === "multiple-games") {
      setMultiple(result);
      return;
    }
    setError(result.message);
  }

  async function handleChesscomImport() {
    clearFeedback();
    try {
      // Validate before the request so users get immediate, specific feedback.
      parseChesscomGameUrl(gameUrl);
      normalizeChesscomUsername(username);
    } catch (cause) {
      setError(
        cause instanceof ChesscomImportError
          ? cause.message
          : "Check the game URL and username.",
      );
      return;
    }

    setChesscomBusy(true);
    try {
      const result = await importChesscomGame({
        gameUrl: gameUrl.trim(),
        username: username.trim(),
      });
      runImport(result.pgn, result.source);
    } catch (cause) {
      setError(
        cause instanceof ChesscomImportError
          ? cause.message
          : "Chess.com import failed. Please try again.",
      );
    } finally {
      setChesscomBusy(false);
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    clearFeedback();
    setBusy(true);
    try {
      const content = await readPgnFile(file);
      setText(content);
      setFilename(file.name);
      runImport(content, { kind: "file", filename: file.name });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read that file.");
    } finally {
      setBusy(false);
    }
  }

  function switchTab(next: ImportTab) {
    setTab(next);
    clearFeedback();
  }

  if (multiple) {
    return (
      <MultiGamePicker
        games={multiple.games}
        onCancel={() => setMultiple(null)}
        onSelect={(gameIndex) =>
          runImport(text, multiple.source, gameIndex)
        }
      />
    );
  }

  return (
    <Card className="mx-auto w-full max-w-3xl">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Import a game</CardTitle>
          {onCancel ? (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              <ArrowLeft className="size-4" aria-hidden />
              Back to game
            </Button>
          ) : (
            <span className="text-xs text-muted">Standard chess PGN only</span>
          )}
        </div>
        <p className="mt-1 text-sm text-muted">
          Import a public Chess.com game, upload a .pgn file, or paste your game
          notation. PGN parsing and replay happen locally.
        </p>
      </CardHeader>

      <CardContent className="space-y-5">
        <div
          className="flex gap-1 rounded-xl border border-line bg-canvas/60 p-1"
          role="tablist"
          aria-label="Game import method"
        >
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => switchTab(id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                tab === id
                  ? "bg-surface-3 text-ink shadow-sm"
                  : "text-muted hover:text-ink",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </button>
          ))}
        </div>

        {tab === "file" ? (
          <div className="space-y-3" role="tabpanel">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pgn"
              className="sr-only"
              aria-label="Choose a PGN file"
              onChange={(event) => {
                void handleFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                void handleFile(event.dataTransfer.files[0]);
              }}
              disabled={busy}
              className={cn(
                "flex min-h-44 w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-8 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 disabled:opacity-60",
                dragging
                  ? "border-accent bg-accent/10"
                  : "border-line hover:border-accent/50 hover:bg-surface-2/60",
              )}
            >
              <span className="grid size-11 place-items-center rounded-xl bg-surface-3 text-accent">
                {busy ? (
                  <LoaderCircle className="size-5 animate-spin" aria-hidden />
                ) : (
                  <Upload className="size-5" aria-hidden />
                )}
              </span>
              <span className="text-sm font-medium text-ink">
                {busy ? "Reading file…" : "Drop your .pgn file here or click to browse"}
              </span>
              <span className="text-xs text-muted">
                Files are read in your browser and never uploaded.
              </span>
            </button>
            {filename ? (
              <p className="flex items-center gap-2 text-xs text-muted">
                <FileText className="size-4 text-accent" aria-hidden />
                Last file: <span className="truncate text-ink">{filename}</span>
              </p>
            ) : null}
          </div>
        ) : tab === "text" ? (
          <div className="space-y-3" role="tabpanel">
            <label htmlFor="pgn-text" className="sr-only">
              PGN notation
            </label>
            <Textarea
              id="pgn-text"
              rows={11}
              value={text}
              spellCheck={false}
              placeholder={'[Event "Friendly Game"]\n[White "Alice"]\n[Black "Bob"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0'}
              onChange={(event) => {
                setText(event.target.value);
                setFilename(undefined);
                clearFeedback();
              }}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted">
                Include tag pairs when you have them — ratings, time control
                and opening will be shown.
              </p>
              <Button
                type="button"
                onClick={() => runImport(text, { kind: "text" })}
                disabled={!text.trim()}
              >
                Analyze PGN
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="space-y-4"
            role="tabpanel"
            onSubmit={(event) => {
              event.preventDefault();
              void handleChesscomImport();
            }}
          >
            <div className="space-y-1.5">
              <label htmlFor="chesscom-url" className="text-sm font-medium text-ink">
                Chess.com game URL
              </label>
              <input
                id="chesscom-url"
                type="url"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                value={gameUrl}
                placeholder="https://www.chess.com/game/live/123456789"
                className={fieldClass}
                onChange={(event) => {
                  setGameUrl(event.target.value);
                  clearFeedback();
                }}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="chesscom-username" className="text-sm font-medium text-ink">
                Chess.com username
              </label>
              <input
                id="chesscom-username"
                type="text"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                value={username}
                placeholder="Either player's username"
                className={fieldClass}
                onChange={(event) => {
                  setUsername(event.target.value);
                  clearFeedback();
                }}
              />
            </div>
            <p className="text-xs leading-relaxed text-muted">
              Public live and daily games are supported. Month-by-month public
              archives are searched newest to oldest, so older games may take a
              moment. Private and unavailable games cannot be imported.
            </p>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted">
                No Chess.com login is required or requested.
              </p>
              <Button
                type="submit"
                disabled={chesscomBusy || !gameUrl.trim() || !username.trim()}
              >
                {chesscomBusy ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin" aria-hidden />
                    Searching archives…
                  </>
                ) : (
                  "Import game"
                )}
              </Button>
            </div>
          </form>
        )}

        {error ? <ErrorAlert>{error}</ErrorAlert> : null}
      </CardContent>
    </Card>
  );
}
