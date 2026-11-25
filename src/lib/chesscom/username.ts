import { ChesscomImportError } from "./errors";

const USERNAME_PATTERN = /^[a-z0-9_-]{1,25}$/;
export const MAX_USERNAME_LENGTH = 25;

/** Chess.com usernames are case-insensitive; stored/normalized form is lowercase. */
export function normalizeChesscomUsername(input: string): string {
  const value = typeof input === "string" ? input.trim().toLowerCase() : "";

  if (!value) {
    throw new ChesscomImportError(
      "invalid-username",
      "Enter the username of either player in the game.",
    );
  }
  if (value.length > MAX_USERNAME_LENGTH) {
    throw new ChesscomImportError(
      "invalid-username",
      `That username is too long (maximum ${MAX_USERNAME_LENGTH} characters).`,
    );
  }
  if (!USERNAME_PATTERN.test(value)) {
    throw new ChesscomImportError(
      "invalid-username",
      "Usernames may contain only letters, numbers, hyphens and underscores.",
    );
  }

  return value;
}
