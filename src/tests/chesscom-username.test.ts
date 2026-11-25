import { describe, expect, it } from "vitest";
import { ChesscomImportError } from "@/lib/chesscom/errors";
import {
  normalizeChesscomUsername,
  MAX_USERNAME_LENGTH,
} from "@/lib/chesscom/username";

describe("normalizeChesscomUsername", () => {
  it("accepts a valid username", () => {
    expect(normalizeChesscomUsername("hikaru")).toBe("hikaru");
  });

  it("normalizes mixed case and whitespace", () => {
    expect(normalizeChesscomUsername("  Hikaru_Nakamura-1  ")).toBe(
      "hikaru_nakamura-1",
    );
  });

  it("allows hyphens and underscores", () => {
    expect(normalizeChesscomUsername("a-b_c")).toBe("a-b_c");
  });

  it("rejects empty input", () => {
    expect(() => normalizeChesscomUsername("   ")).toThrowError(
      ChesscomImportError,
    );
  });

  it("rejects invalid characters", () => {
    for (const value of ["bad name", "user@example", "user.name", "üser"]) {
      expect(() => normalizeChesscomUsername(value)).toThrow(/letters/i);
    }
  });

  it("rejects excessive length", () => {
    const long = "a".repeat(MAX_USERNAME_LENGTH + 1);
    expect(() => normalizeChesscomUsername(long)).toThrow(/too long/i);
  });

  it("accepts the maximum length", () => {
    const max = "a".repeat(MAX_USERNAME_LENGTH);
    expect(normalizeChesscomUsername(max)).toBe(max);
  });
});
