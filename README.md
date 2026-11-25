# MoveLens

A free, local-first chess game analysis website. This repository currently
contains **Phase 1: Foundation and PGN viewer** only.

Users can upload a `.pgn` file or paste PGN notation, inspect game metadata,
replay every move on an interactive board, and navigate to any position. Chess
rules and FEN state come from `chess.js`.

## Scope

Implemented:

- File upload and textarea import with clear validation errors
- Explicit handling of PGN documents containing multiple games
- Normalized game data model and import service
- Interactive chessboard, player details, result, time control, opening and FEN
- Previous / next / first / last / arbitrary-move navigation plus arrow keys
- Castling, en passant, promotion, comments and custom starting FEN positions

Not implemented yet (planned for later phases):

- Stockfish/WASM engine analysis
- Move classifications, evaluations and accuracy
- Chess.com URL import
- IndexedDB persistence and history dashboard
- Authentication or any backend service

## Requirements

- Node.js 22.12+, 24+, or 26+ (Vitest 5 requirement; Next.js 16 needs 20.9+)
- pnpm 11+

## Getting started

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000.

## Scripts

```bash
pnpm dev        # development server
pnpm build      # production build
pnpm start      # run the production build
pnpm lint       # ESLint
pnpm typecheck  # TypeScript (strict, no emit)
pnpm test       # unit tests
```

## Architecture

```text
src/
  app/                        Next.js App Router pages and global theme
  components/
    ui/                       shadcn-style primitives (Button, Card, Badge, Alert, Textarea)
    import/                   import panel and multi-game selection UI
    game/                     board, move list, metadata and navigation controls
    analysis-workspace.tsx    client workspace that switches import/viewer
  hooks/
    use-game-viewer.ts        ply state and navigation callbacks
  lib/
    chess/
      types.ts                normalized game, move and metadata types
      pgn-parser.ts           chess.js-backed PGN parsing and validation
      pgn-split.ts            multi-game PGN document splitting
      game-navigation.ts      timeline building and position status helpers
    import/
      pgn-import-service.ts   import orchestration and result union
      file-reading.ts         browser file validation and reading
    engine/types.ts           EngineService interface (Phase 3 integration point)
    analysis/types.ts         analysis result types (Phase 4 integration point)
  tests/                      Vitest unit tests and fixtures
```

Business logic lives in `lib/`; components only manage view state and rendering.
`chess.js` is the single source of truth for legal positions and moves. The
viewer replays a game once into an indexable timeline, so navigation never
mutates game data.

## Technical decisions

- **Next.js App Router + React 19 + TypeScript (strict) + Tailwind CSS 4.**
- **shadcn/ui pattern** with local primitives built on CVA, `clsx`,
  `tailwind-merge`, Radix Slot and Lucide icons. Components are copied into the
  project rather than pulled from a runtime UI package.
- **`chess.js` (BSD-2-Clause)** for PGN parsing, FEN and legality.
- **`react-chessboard` (MIT)** for the board. It is maintained, supports React
  19, and avoids needing Chessground's GPL license.
- **Multi-game PGNs are never silently truncated.** The import service returns
  a selection result and the UI asks the user which game to open.
- **No backend, accounts or analytics.** All parsing happens in the browser.
- **Future phases are interfaces only.** No engine or analysis results are
  faked in Phase 1.

## Dependencies

Runtime: `next`, `react`, `react-dom`, `chess.js`, `react-chessboard`,
`clsx`, `tailwind-merge`, `class-variance-authority`, `@radix-ui/react-slot`,
`lucide-react`.

Development: `typescript`, `eslint`, `eslint-config-next`, `tailwindcss`,
`@tailwindcss/turbopack`, `@types/*`, `vitest`.

## Testing and verification

`pnpm typecheck`, `pnpm lint`, `pnpm test` (28 tests) and `pnpm build` all pass.
The production build was also exercised in headless Chrome: paste import, file
upload, move navigation, keyboard navigation, arbitrary move jumps, multi-game
selection and mobile overflow checks passed.

## Known limitations

- Only standard chess is supported; PGN variants such as Chess960 are rejected
  explicitly.
- Opening names are read from PGN headers rather than inferred from moves.
- PGN comments are shown for the move they follow; variations are ignored by
  the viewer (the mainline is analyzed).
- No persistence: refreshing the page clears the loaded game.
- Engine evaluation, move classifications and accuracy are intentionally absent
  until their planned phases.
