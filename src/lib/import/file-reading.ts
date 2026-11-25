export const MAX_PGN_FILE_BYTES = 2 * 1024 * 1024;

/** Reads a .pgn file in the browser with explicit, user-facing validation. */
export async function readPgnFile(file: File): Promise<string> {
  if (!file.name.toLowerCase().endsWith(".pgn")) {
    throw new Error("Please choose a file with a .pgn extension.");
  }
  if (file.size === 0) {
    throw new Error("The selected file is empty.");
  }
  if (file.size > MAX_PGN_FILE_BYTES) {
    throw new Error("That PGN file is too large. The limit is 2 MB.");
  }

  return file.text();
}
