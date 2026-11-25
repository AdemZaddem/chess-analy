import { FullGameAnalysisRunner } from "@/lib/analysis/full-game-service";
import type { AnalysisSettings, FullGameAnalysis } from "@/lib/analysis/types";
import type { NormalizedGame } from "@/lib/chess/types";
import { withReviewId } from "@/lib/storage/schema";
import {
  createScriptedEngine,
  gameFromPgn,
  makeEngineEvaluation,
} from "./full-game-test-helpers";
import { STANDARD_PGN } from "./fixtures";

/** Parsed games start with a random ID; Phase 6 persistence uses a stable one. */
export function deterministicGame(
  pgn: string = STANDARD_PGN,
  source: NormalizedGame["source"] = { kind: "text" },
): NormalizedGame {
  return withReviewId({ ...gameFromPgn(pgn), source });
}

/** Produces a real typed result through the production runner, not hand-built data. */
export async function completeAnalysis(
  game: NormalizedGame,
  settings: AnalysisSettings,
): Promise<FullGameAnalysis> {
  const { engine } = createScriptedEngine((fen, index) =>
    makeEngineEvaluation(fen, {
      whiteCentipawns: 10 + index,
      depth: settings.depth,
    }),
  );
  return new FullGameAnalysisRunner(engine).analyze({ game, settings });
}
