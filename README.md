# MoveLens

A free, local-first chess game analysis website. The project currently includes
**Phase 1: Foundation and PGN viewer** and **Phase 2: Public Chess.com game
import**.

Users can import a public Chess.com game by URL and username, upload a `.pgn`
file, or paste PGN notation. Games are normalized once, replayed on an
interactive board, and navigable by move, keyboard, or arbitrary position.
Chess rules and FEN state come from `chess.js`.

## Scope

Implemented:

- Chess.com live and daily game import through the official Published-Data API
- File upload and textarea PGN import with clear validation errors
- Explicit handling of PGN documents containing multiple games
- Normalized game data model and shared import service
- Interactive chessboard, player details, result, time control, opening and FEN
- Previous / next / first / last / arbitrary-move navigation plus arrow keys
- Castling, en passant, promotion, comments and custom starting FEN positions

Not implemented yet (planned for later phases):

- Stockfish/WASM engine analysis
- Move classifications, evaluations and accuracy
- IndexedDB persistence and history dashboard
- Authentication or user accounts

## Chess.com import

### What it does

The **Chess.com** tab accepts:

- A public game URL, either
  `https://www.chess.com/game/live/{gameId}` or
  `https://www.chess.com/game/daily/{gameId}`.
- The username of **either** player in that game.

The browser sends only these two strings to the local Next.js server route
`POST /api/import/chesscom`. All Chess.com HTTP requests are made server-side.
The returned PGN is passed through the same Phase 1 `parsePgn` and `importPgn`
pipeline used for file and paste imports, then opened in the existing viewer.

### Official API only

No scraping, browser automation, login, cookies, session tokens, or unofficial
endpoints are used. Only the official Published-Data API base URL is allowed:

```text
https://api.chess.com/pub/
```

The two endpoints used are:

```text
GET /player/{username}/games/archives
GET /player/{username}/games/{YYYY}/{MM}
```

Chess.com does not provide a documented direct single-game lookup endpoint, so
the service searches the supplied player's monthly archives. It:

1. Parses and validates the game URL with the native `URL` API.
2. Normalizes the username (case-insensitive, lowercase internally).
3. Sorts the returned archive URLs newest to oldest and removes duplicates.
4. Fetches archives **sequentially**, never concurrently.
5. Matches the requested ID against the game object's URL, with exact parsed
   path matching — no substring matching and no date guessing.
6. Stops immediately when the exact game is found.
7. Requires `rules === "chess"`, a non-empty PGN, and successful parsing with
   the existing `chess.js` parser. If the PGN contains a `[Link]` tag, it must
   also identify the same exact game.
8. Returns typed PGN, metadata, and import source to the client.

A user-provided game URL is never used as a fetch destination. Server-side
archive URLs are validated against the official API host and path shape before
they are fetched.

### Reliability and rate limits

Chess.com documents that serial requests are allowed while parallel requests
can trigger rate limiting. This implementation therefore makes one archive
request at a time, does not retry `429` aggressively, and never repeatedly
fetches the same archive within one import.

The server sends a descriptive `User-Agent`:

```text
MoveLens/1.0 (chess game import; contact: <CHESSCOM_API_CONTACT>)
```

If `CHESSCOM_API_CONTACT` is not set, a generic project identifier is used. No
contact address is invented.

A small process-local in-memory cache stores conditional GET information
(`ETag` / `Last-Modified`) for official API responses. It is not persisted and
is never shared between server processes. A `304` response reuses the cached
body, avoiding unnecessary transfers.

### Errors

Errors use a stable code plus a human-readable message:

| Code | Meaning | HTTP status |
| --- | --- | --- |
| `invalid-request` | Body is not JSON or fields are missing | 400 |
| `invalid-url` | Unsupported host, path, type, or ID | 400 |
| `invalid-username` | Empty or malformed username | 400 |
| `not-found` | Chess.com archive list was not found | 404 |
| `gone` | Chess.com no longer provides the data | 410 |
| `rate-limited` | Upstream `429`; no aggressive retry | 429 |
| `timeout` | Upstream request timed out | 504 |
| `network-error` | Connection failed | 502 |
| `upstream-error` | Upstream `5xx` or unexpected status | 502 |
| `invalid-json` | Upstream response was not valid JSON | 502 |
| `invalid-response` | Upstream response had an invalid shape or archive URL | 502 |
| `game-not-found` | Game was absent from the searched public archives | 404 |
| `game-unavailable` | Game has no PGN or is private/unavailable | 404 |
| `unsupported-variant` | Game rules are not standard chess | 422 |
| `invalid-pgn` | Returned PGN failed the existing parser | 422 |
| `internal-error` | Unexpected server failure | 500 |

If a monthly archive listed by the API returns `404` or `410`, that month is
skipped and older archives continue to be searched. Other failures stop the
import and are shown in the panel. A failed Chess.com import never replaces a
game already loaded in the viewer.

## Requirements

- Node.js 22.12+, 24+, or 26+ (Vitest 5 requirement; Next.js 16 needs 20.9+)
- pnpm 11+

## Getting started

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000.

Optional environment variable for the upstream `User-Agent`:

```bash
CHESSCOM_API_CONTACT="you@example.com" pnpm dev
```

For production:

```bash
pnpm build
CHESSCOM_API_CONTACT="you@example.com" pnpm start
```

Chess.com import needs outbound HTTPS access from the Next.js server to
`api.chess.com`. File and paste PGN imports remain entirely browser-local.

## Scripts

```bash
pnpm dev        # development server
pnpm build      # production build
pnpm start      # run the production build
pnpm lint       # ESLint
pnpm typecheck  # TypeScript (strict, no emit)
pnpm test       # unit and integration tests (mocked HTTP)
```

## Architecture

```text
src/
  app/
    api/import/chesscom/route.ts  typed server route for Chess.com retrieval
    page.tsx / layout.tsx         App Router entry points
  components/
    ui/                           local Button, Card, Badge, Alert, Textarea
    import/                       import tabs, PGN entry and multi-game picker
    game/                         board, move list, metadata and navigation
    analysis-workspace.tsx        preserves loaded game while import panel is open
  hooks/
    use-game-viewer.ts            ply state and navigation callbacks
  lib/
    chess/
      types.ts                    normalized game, move and metadata types
      pgn-parser.ts               chess.js-backed PGN parsing and validation
      pgn-split.ts                multi-game PGN document splitting
      game-navigation.ts          timeline and position status helpers
    chesscom/
      errors.ts                   stable error codes and error class
      game-url.ts                 native URL parser for live/daily links
      username.ts                 username normalization and validation
      pubapi-types.ts             external JSON response shapes
      pubapi-client.ts            timeout, UA, status mapping, conditional cache
      game-search.ts              serial archive search and exact-ID validation
      http-status.ts              error code to HTTP status mapping
      types.ts                    typed request/response contracts
    import/
      pgn-import-service.ts       shared import orchestration and result union
      chesscom-import-client.ts   browser helper for the local server route
      file-reading.ts             browser file validation and reading
    engine/types.ts               EngineService interface (Phase 3 integration point)
    analysis/types.ts             analysis result types (Phase 4 integration point)
  tests/                          Vitest unit and integration tests
```

Business logic lives in `lib/`; components only manage view state and rendering.
`chess.js` is the single source of truth for legal positions and moves. The
viewer replays a game once into an indexable timeline, so navigation never
mutates game data. External Chess.com response types are kept separate from
internal normalized game types.

## Technical decisions

- **Next.js App Router + React 19 + TypeScript (strict) + Tailwind CSS 4.**
- **shadcn/ui pattern** with local primitives built on CVA, `clsx`,
  `tailwind-merge`, Radix Slot and Lucide icons.
- **`chess.js` (BSD-2-Clause)** for PGN parsing, FEN and legality.
- **`react-chessboard` (MIT)** for the board; no Chessground GPL dependency.
- **One import pipeline.** Chess.com retrieval only produces a PGN and source
  metadata; parsing, multi-game handling and viewing stay shared with Phase 1.
- **No arbitrary fetch URL.** The browser calls a local typed route; the server
  constructs official API URLs and validates returned archive URLs.
- **No backend persistence, accounts or analytics.**

## Dependencies

Runtime: `next`, `react`, `react-dom`, `chess.js`, `react-chessboard`,
`clsx`, `tailwind-merge`, `class-variance-authority`, `@radix-ui/react-slot`,
`lucide-react`.

Development: `typescript`, `eslint`, `eslint-config-next`, `tailwindcss`,
`@tailwindcss/turbopack`, `@types/*`, `vitest`, `jsdom`,
`@testing-library/react`.

## Testing and verification

`pnpm typecheck`, `pnpm lint`, `pnpm test` (**77 tests**) and `pnpm build` all
pass. Automated tests mock all external HTTP requests; they never depend on the
live Chess.com API. Coverage includes URL/username validation, archive ordering
and exact-ID matching, missing variants/PGNs, upstream 404/410/429/5xx,
timeouts, invalid JSON, route status mapping, successful Chess.com import into
the existing viewer, move navigation, continued PGN import, and preservation of
a loaded game after a failed import.

A live production-server integration check was also performed against the
official API: `POST /api/import/chesscom` with
`https://www.chess.com/game/live/184727190848` and username `hikaru` returned
HTTP 200 with the exact game ID, `rules: "chess"`, and a 3,619-character PGN
that passed the existing parser.

## Known limitations

- Only public games that appear in the supplied player's official monthly
  archives can be found. Private, deleted, or unavailable games cannot.
- Searching very old games may require many sequential archive requests; the
  UI shows a searching state and there is no arbitrary early cutoff.
- Only `live` and `daily` game URLs are accepted. Other Chess.com game paths
  are rejected.
- Only standard chess rules are imported; variants are rejected explicitly.
- Daily-game support is covered by URL and mocked archive tests; no public
  daily game was used in the live check above.
- The conditional GET cache is in-memory and process-local; it is not a shared
  or persistent cache.
- Opening names come from PGN headers rather than move inference.
- PGN comments are shown for the move they follow; variations are ignored by
  the viewer (the mainline is analyzed).
- No persistence: refreshing the page clears the loaded game.
- Engine evaluation, move classifications and accuracy are intentionally absent
  until their planned phases.

## Disclaimer

MoveLens is an independent project and is **not affiliated with, endorsed by,
or sponsored by Chess.com**. Chess.com is a trademark of its respective owner.
This project uses only Chess.com's public Published-Data API and does not
reproduce or store private account data.
