export type Color = "w" | "b";

export type GameResult = "1-0" | "0-1" | "1/2-1/2" | "*";

export interface PlayerInfo {
  name: string;
  rating?: number;
  title?: string;
}

export interface MoveRecord {
  /** 1-based half-move index. 1 = White's first move. */
  ply: number;
  /** Fullmove number as shown in standard notation. */
  moveNumber: number;
  color: Color;
  san: string;
  from: string;
  to: string;
  promotion?: string;
  /** FEN of the position after this move. */
  fen: string;
  comment?: string;
}

export interface GameMetadata {
  event?: string;
  site?: string;
  date?: string;
  round?: string;
  white: PlayerInfo;
  black: PlayerInfo;
  result: GameResult;
  timeControl?: string;
  eco?: string;
  opening?: string;
}

export interface GameSource {
  kind: "file" | "text";
  filename?: string;
}

export interface NormalizedGame {
  id: string;
  metadata: GameMetadata;
  /** FEN of the position before the first move. */
  initialFen: string;
  moves: MoveRecord[];
  /** PGN re-serialized by chess.js from the parsed game. */
  pgn: string;
  source: GameSource;
  /** Number of games detected in the imported PGN document. */
  gameCount: number;
  /** 1-based index of the selected game inside the document. */
  gameIndex: number;
  warnings: string[];
}

/** Result of parsing a single PGN game, before import metadata is attached. */
export type ParsedGame = Omit<
  NormalizedGame,
  "source" | "gameCount" | "gameIndex" | "warnings"
>;

/** Compact summary used by the multi-game selection UI. */
export interface GamePreview {
  index: number;
  white: string;
  black: string;
  result: GameResult;
  plyCount: number;
  opening?: string;
}
