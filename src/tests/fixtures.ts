export const STANDARD_PGN = `[Event "Test Open"]
[Site "Internet"]
[Date "2025.06.15"]
[Round "3"]
[White "Alice"]
[Black "Bob"]
[WhiteElo "1842"]
[BlackElo "1775"]
[Result "1-0"]
[TimeControl "600+5"]
[ECO "C60"]
[Opening "Ruy Lopez"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 1-0`;

export const CASTLING_PGN = `[White "Alice"]
[Black "Bob"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 1-0`;

export const EN_PASSANT_PGN = `[White "Alice"]
[Black "Bob"]

1. e4 a6 2. e5 d5 3. exd6 *`;

export const PROMOTION_PGN = `[SetUp "1"]
[FEN "8/6P1/8/8/8/8/8/K6k w - - 0 1"]

1. g8=Q *`;

export const CHECKMATE_PGN = `[White "Alice"]
[Black "Bob"]

1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0`;

export const STALEMATE_PGN = `[SetUp "1"]
[FEN "7k/5Q2/8/6K1/8/8/8/8 w - - 0 1"]

1. Kg6 1/2-1/2`;

export const LONG_PGN = `[Event "Long game"]
[White "Alice"]
[Black "Bob"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 *`;

export const BLACK_TO_MOVE_FEN_PGN = `[SetUp "1"]
[FEN "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"]
[White "Alice"]
[Black "Bob"]

1. e5 *`;

export const REPETITION_PGN = `[White "Alice"]
[Black "Bob"]

1. Nf3 Nf6 2. Ng1 Ng8 *`;

export const CUSTOM_FEN_PGN = `[Event "Custom position"]
[SetUp "1"]
[FEN "8/8/8/8/8/8/4P3/4K2k w - - 3 7"]
[White "Alice"]
[Black "Bob"]

1. e4 Kh2 2. e5 Kh1 1-0`;

export const COMMENTED_PGN = `[White "Alice"]
[Black "Bob"]

1. e4 e5 2. Nf3 {The king's knight develops} Nc6 1-0`;

export const MULTI_GAME_PGN = `[Event "Game 1"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]

1. e4 e5 1-0

[Event "Game 2"]
[White "Carol"]
[Black "Dave"]
[Result "0-1"]

1. d4 d5 0-1`;

export const INVALID_PGN = `1. e4 e5 2. Nz3`;
