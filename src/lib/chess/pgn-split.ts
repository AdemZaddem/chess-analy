const HEADER_LINE = /^\s*\[([A-Za-z0-9_-]+)\s+"(?:[^"\\]|\\.)*"\s*\]\s*$/;

/**
 * Splits a PGN document into individual games.
 *
 * A new game starts when a tag pair appears after move text has already been
 * seen, or when a tag repeats in the same game. This covers normal multi-game
 * files (including files without a blank line between games) while leaving
 * single games intact.
 */
export function splitPgnGames(input: string): string[] {
  const lines = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  const chunks: string[][] = [[]];
  let seenMoveText = false;
  let headerTags = new Set<string>();
  let openBraces = 0;
  let openParentheses = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    const headerMatch = line.match(HEADER_LINE);
    const tag = headerMatch?.[1];

    if (
      tag &&
      openBraces === 0 &&
      openParentheses === 0 &&
      (seenMoveText || headerTags.has(tag))
    ) {
      chunks.push([line]);
      seenMoveText = false;
      headerTags = new Set([tag]);
      continue;
    }

    chunks[chunks.length - 1]?.push(line);

    if (!trimmed) continue;
    if (tag && openBraces === 0 && openParentheses === 0) {
      headerTags.add(tag);
      continue;
    }

    seenMoveText = true;
    for (const character of trimmed) {
      if (character === "{") openBraces += 1;
      if (character === "}") openBraces = Math.max(0, openBraces - 1);
      if (character === "(") openParentheses += 1;
      if (character === ")") openParentheses = Math.max(0, openParentheses - 1);
    }
  }

  return chunks
    .map((chunk) => chunk.join("\n").trim())
    .filter((chunk) => chunk.length > 0);
}
