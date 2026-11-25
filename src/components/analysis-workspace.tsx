"use client";

import { useState } from "react";
import { GameViewer } from "@/components/game/game-viewer";
import { ImportPanel } from "@/components/import/import-panel";
import type { NormalizedGame } from "@/lib/chess/types";

export function AnalysisWorkspace() {
  const [game, setGame] = useState<NormalizedGame | null>(null);

  if (game) {
    return <GameViewer game={game} onReset={() => setGame(null)} />;
  }

  return <ImportPanel onImport={setGame} />;
}
