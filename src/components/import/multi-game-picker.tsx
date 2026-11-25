"use client";

import { ArrowLeft, Layers3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { GamePreview } from "@/lib/chess/types";

export function MultiGamePicker({
  games,
  onSelect,
  onCancel,
}: {
  games: GamePreview[];
  onSelect: (index: number) => void;
  onCancel: () => void;
}) {
  return (
    <Card className="mx-auto w-full max-w-3xl">
      <CardHeader className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-violet/10 text-violet">
          <Layers3 className="size-5" aria-hidden />
        </span>
        <div>
          <CardTitle>Multiple games found</CardTitle>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            This PGN contains {games.length} games. Choose the one you want to
            open — nothing is imported automatically.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="scrollbar-subtle max-h-80 space-y-2 overflow-y-auto pr-1">
          {games.map((game) => (
            <li key={game.index}>
              <button
                type="button"
                onClick={() => onSelect(game.index)}
                className="flex w-full items-center justify-between gap-4 rounded-xl border border-line bg-surface-2 px-4 py-3 text-left transition-colors hover:border-accent/40 hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">
                    {game.white} <span className="text-muted">vs</span>{" "}
                    {game.black}
                  </span>
                  <span className="mt-1 block text-xs text-muted">
                    Game {game.index} · {game.plyCount} plies
                    {game.opening ? ` · ${game.opening}` : ""}
                  </span>
                </span>
                <Badge variant="success" className="shrink-0 font-mono">
                  {game.result}
                </Badge>
              </button>
            </li>
          ))}
        </ul>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <ArrowLeft className="size-4" aria-hidden />
          Back to import
        </Button>
      </CardContent>
    </Card>
  );
}
