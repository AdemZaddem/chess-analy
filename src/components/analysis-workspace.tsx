"use client";

import { useState } from "react";
import { GameViewer } from "@/components/game/game-viewer";
import { ImportPanel } from "@/components/import/import-panel";
import type { NormalizedGame } from "@/lib/chess/types";

export function AnalysisWorkspace() {
  const [game, setGame] = useState<NormalizedGame | null>(null);
  const [showImport, setShowImport] = useState(true);

  if (!showImport && game) {
    return (
      <GameViewer
        game={game}
        onImportAnother={() => setShowImport(true)}
        onReset={() => {
          setGame(null);
          setShowImport(true);
        }}
      />
    );
  }

  return (
    <ImportPanel
      onImport={(nextGame) => {
        setGame(nextGame);
        setShowImport(false);
      }}
      onCancel={game ? () => setShowImport(false) : undefined}
    />
  );
}
