/** External Chess.com Published-Data response shapes. Keep separate from normalized domain types. */
export interface PubApiPlayer {
  username?: string;
  name?: string;
}

export interface PubApiGame {
  url?: unknown;
  pgn?: unknown;
  rules?: unknown;
  time_class?: unknown;
  white?: PubApiPlayer | unknown;
  black?: PubApiPlayer | unknown;
}

export interface PubApiMonthlyGames {
  games?: unknown;
}

export interface PubApiArchives {
  archives?: unknown;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseGameRecord(value: unknown): PubApiGame | null {
  return isRecord(value) ? (value as PubApiGame) : null;
}

export function parsePlayerName(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const username = value.username;
  if (typeof username === "string" && username.trim()) return username.trim();
  const name = value.name;
  return typeof name === "string" && name.trim() ? name.trim() : undefined;
}

export function parseArchivesResponse(value: unknown): string[] | null {
  if (!isRecord(value) || !Array.isArray(value.archives)) return null;
  const archives: string[] = [];
  for (const entry of value.archives) {
    if (typeof entry !== "string" || !entry.trim()) return null;
    archives.push(entry.trim());
  }
  return archives;
}

export function parseMonthlyGamesResponse(value: unknown): PubApiGame[] | null {
  if (!isRecord(value) || !Array.isArray(value.games)) return null;
  const games: PubApiGame[] = [];
  for (const entry of value.games) {
    const game = parseGameRecord(entry);
    if (!game) return null;
    games.push(game);
  }
  return games;
}
