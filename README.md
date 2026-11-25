# MoveLens

A free, local-first chess game analysis website. The project includes
**Phase 1: Foundation and PGN viewer**, **Phase 2: Public Chess.com game
import**, **Phase 3: Local Stockfish single-position analysis**,
**Phase 4: Full-game review with deterministic move classification and
accuracy**, **Phase 5: Interactive game review and visual analysis**, and
**Phase 6: Local persistence, saved reviews, privacy-friendly sharing and
portable export/import**.

Users can import a public Chess.com game by URL and username, upload a `.pgn`
file, or paste PGN notation. Games are normalized once, replayed on an
interactive board, and navigable by move, keyboard, or arbitrary position.
Chess rules and FEN state come from `chess.js`. The current position can be
analyzed with a self-hosted Stockfish 19 Lite WASM engine running entirely in a
Web Worker. An explicit full-game review analyzes every position sequentially,
classifies every played move, and reports independent White and Black accuracy.
Imported games are saved in browser IndexedDB; completed reviews can be reopened
without another engine run, shared as a PGN-only URL fragment, or exported as a
versioned JSON file.

## Naming

**MoveLens** is the product name shown in the page title, landing page,
documentation, User-Agent and user-facing messages. `chess-analy` remains the
repository/package name in `package.json` and is not presented as a separate
product. The lowercase technical identifiers `movelens` (IndexedDB database),
`movelens-board` (DOM id) and `movelens-review` (export format) are intentional
stable identifiers, not leftover branding; changing them would require schema
and compatibility handling.

## Licensing and free use

MoveLens is free to use: there are no accounts, subscriptions, paid APIs or
required secrets for the features described here.

The application source code does **not** yet have a selected license. No root
`LICENSE` file should be inferred from this README or from
[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md); redistribution terms for the
application code are undecided.

The bundled Stockfish 19 Lite WASM engine is **GPL-3.0**. Its provenance, hashes,
source links and distribution obligations are recorded in
`public/engine/ENGINE_LICENSES.md`, with the full GPL text in
`public/engine/COPYING.txt`. Publicly distributing the application together with
those assets requires satisfying the engine's Corresponding Source obligations.
That obligation applies to the Stockfish assets and does not choose a license
for the rest of the application.

## Scope

Implemented:

- Chess.com live and daily game import through the official Published-Data API
- File upload and textarea PGN import with clear validation errors
- Explicit handling of PGN documents containing multiple games
- Normalized game data model and shared import service
- Interactive chessboard, player details, result, time control, opening and FEN
- Previous / next / first / last / arbitrary-move navigation plus arrow keys
- Castling, en passant, promotion, comments and custom starting FEN positions
- Self-hosted Stockfish 19 Lite WASM analysis of the displayed position
- UCI initialization/search/stop/quit with typed parsing and cancellation
- White-perspective centipawn or mate evaluations, best move and PV
- Depth 10 / 15 / 20 controls, progress display, CPU warning and retry
- Explicit full-game analysis with Quick / Standard / Deep presets
- N+1 sequential position searches using one shared engine instance
- Engine WDL expected points with a documented centipawn fallback
- Deterministic move labels and transparent White / Black accuracy
- Progress, cancel, retry, stale-result rejection and move-by-move inspection
- Move-list classification indicators tied to the selected game and settings
- Interactive evaluation graph and evaluation bar sharing one scaling convention
- Played/best-move arrows, square highlights and a validated PV variation viewer
- Review summary with accuracy, classification counts and data-driven key moments
- Board-adjacent significant-move header and plain-language arrow legend
- Versioned IndexedDB records with automatic save, status labels and restore
- Saved-review list with open, delete and confirmed clear-all controls
- Completed analysis snapshots restored without rerunning Stockfish
- PGN-and-settings share links encoded in the URL fragment, with gzip when available
- Versioned JSON review bundles with optional completed analysis and validated imports
- Browser-only storage and sharing; no accounts, backend database, cloud sync or telemetry

Explicitly out of scope:

- Move-by-move opening explorer or online opening database
- Authentication, accounts, server-side storage, cloud sync, subscriptions or paid APIs
- Account-based/social sharing, friends, leaderboards, chat or online multiplayer
- New classification logic, AI tactical explanations or a different Stockfish engine

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

## Local Stockfish analysis (Phase 3)

### Engine and assets

The engine is **Stockfish 19 Lite WASM**, single-threaded build, from the exact
stable `stockfish@19.0.1` release (`nmrugg/stockfish.js`). The older
`stockfish.js` npm package (latest `10.0.2`) was not used. The engine reports
`Threads type spin default 1 min 1 max 1` and does not use `SharedArrayBuffer`.
Its NNUE network is `nn-61e7af4bb97d.nnue`.

Both downloaded files were verified against the originals in `~/Downloads` and
copied unchanged into `public/engine/`. The JavaScript wrapper derives its WASM
URL from its own path, so `new Worker("/engine/stockfish-19-lite-single.js")`
loads the matching `stockfish-19-lite-single.wasm`. The wrapper also hard-codes
the expected WASM length (`1845971`), which matches exactly. No CDN runtime
fetch is used.

| Asset | Size | SHA-256 |
| --- | ---: | --- |
| `public/engine/stockfish-19-lite-single.js` | 28,230 bytes | `ccb130d7ff29408531c47d859a49f91d59d4f482d05a53eb1a3231a4f624c91a` |
| `public/engine/stockfish-19-lite-single.wasm` | 1,845,971 bytes | `ee4f115bdb2d32cadf96cada104a05b5ec257d7ad6f57582190b49bc71f096de` |

### Runtime architecture

- The React main thread never runs engine code. All UCI I/O happens in one
  dedicated `Worker`.
- `UciWorkerTransport` sends and receives string UCI lines and wires the
  engine's `progressPort` through a `MessageChannel` for genuine WASM download
  progress.
- `StockfishEngineService` serializes searches, assigns request IDs, tracks
  `info`/`bestmove` output, rejects stale responses, sends `stop` on abort, and
  terminates the worker with `quit` on shutdown.
- `acquireSharedEngine()` is a ref-counted singleton with delayed termination,
  so React Strict Mode remounts reuse one worker.
- `useEngineAnalysis(fen)` clears results when the displayed FEN changes and
  uses a generation counter plus `AbortController` so navigation or unmount
  cannot display another position's result.
- `EngineAnalysisPanel` renders depth presets, loading/progress, stop,
  evaluation, best move, principal variation, CPU warning and retry.

Supported UCI traffic includes `uci`, `isready`, `ucinewgame`, `setoption`,
`position startpos`, `position fen`, `go depth`, `go movetime`, `stop`, `quit`,
`uciok`, `readyok`, `info`, `bestmove` and `info string` lines. The parser reads
depth/seldepth, MultiPV, centipawn or mate scores, WDL counts when
`UCI_ShowWDL` is enabled, nodes, NPS, hashfull, time and PV tokens. Scores are
normalized to **White perspective**; mate scores stay distinct from centipawns.
Best moves and the full PV are replayed with
`chess.js`, including castling, en passant and promotion, and illegal or
unparseable engine output is rejected.

### Measured browser verification

Local Chrome `157.0.8103.79` (headless) loaded the self-hosted assets from
`127.0.0.1:8123` via `python3 -m http.server`, using a real Web Worker and real
WASM. The following are measured values, not estimates:

| Phase | Measured time |
| --- | ---: |
| `uciok` | 120 ms |
| `readyok` | 120 ms |
| WASM download progress reached 100% | 122 ms |
| Search, depth 10 | 21 ms |
| Search, depth 15 | 72 ms |
| Search, depth 20 | 354 ms |

| Depth | Best move | Score (White) | Nodes |
| ---: | --- | --- | ---: |
| 10 | `e2e4` | `cp 31` | 9,492 |
| 15 | `e2e4` | `cp 36` | 54,002 |
| 20 | `e2e4` | `cp 29` | 347,410 |

The main-thread interval continued during the searches (`uiTicks: 56`,
`searchTicks: 45`), so the browser remained responsive. A separate production
`next start` check imported `[Event "Browser smoke"] ... 1. e4 e5 2. Nf3 Nc6 *`
through the UI and clicked **Analyze position**; the panel showed `+0.31`,
`Depth 10`, best move `e4 (e2e4)` and the PV `1. e4 c5 2. Nf3 Nc6 3. Nc3 e6
4. d4 cxd4 5. Nxd4` in 109 ms. These numbers describe one warm local machine;
deeper searches are device-dependent.

### Engine license

The engine is **GPL-3.0**, not MIT. `public/engine/ENGINE_LICENSES.md` records
provenance, exact version, hashes, source links and distribution obligations,
and `public/engine/COPYING.txt` contains the full GNU GPL v3 text. The
JavaScript header and WASM binary were not modified. Vendored engine code is
excluded from ESLint because it is third-party generated/distributed code. If
you publicly distribute this application with these assets, provide the
Corresponding Source for `stockfish@19.0.1` / Stockfish 19 as described in that
document.

## Full-game review (Phase 4)

### Position strategy and engine use

Full-game analysis is a separate, explicit action. Importing a game never
starts it automatically. The runner (`src/lib/analysis/full-game-service.ts`)
does the following:

1. Replays the imported game once from its real `initialFen` with `chess.js`.
   A game with `N` plies becomes exactly `N + 1` positions: the starting
   position plus every position after a played move.
2. Handles standard and custom starting FEN, black-to-move starts, promotion,
   castling, en passant, checkmate, stalemate, other draws and resignation
   games. Terminal positions are recognized from the board, not from the PGN
   result alone.
3. Sends every position to the **same** `StockfishEngineService` instance,
   one `analyzePosition` call at a time. There is no worker per move and no
   overlapping search; a run guard rejects concurrent full runs with
   `already-running`.
4. Uses presets **Quick = depth 12**, **Standard = depth 15**, and
   **Deep = depth 18**. `MultiPV` is 1 for this phase, but depth and MultiPV
   remain configurable through the existing engine API.
5. Reports progress after initialization and every position: status,
   analyzed/total positions, current ply and FEN, percent, elapsed time,
   engine download percentage and engine name.
6. Supports cancellation with `AbortController` + `stop()`, safe retry after
   failure, and a full-FEN cache. The cache is intentionally conservative:
   repeated piece placement is **not** reused when halfmove/fullmove counters
   differ.
7. Rejects stale results using analysis identity (game id, initial FEN, played
   moves, preset, depth, MultiPV and expected-points/classification settings),
   generation counters and a keyed React host. Changing game or preset
   remounts the analysis state, aborts old work and prevents an old result
   from appearing under a new game.

Every played move receives SAN, UCI, FEN before/after, evaluations before/after
with White-perspective score, side to move, depth, PV, best move, engine stats,
classification, expected-points loss and tactical metadata. Mate and
centipawn scores remain distinct all the way through the typed result.

Deeper analysis examines more nodes per position and takes longer. Timing is
hardware- and search-condition-dependent, so results may differ between
devices. The UI states this explicitly and never starts analysis on import.

### Expected points and `UCI_ShowWDL`

The bundled Stockfish 19 Lite build supports `UCI_ShowWDL`. The service enables
it during initialization before `isready`, so the first search already carries
WDL. UCI reports `wdl w d l` as per-mille counts **from the side to move's
perspective**. Expected points are computed centrally in
`src/lib/analysis/expected-points.ts`:

```text
sideToMoveExpected = (win + draw / 2) / (win + draw + loss)
whiteExpected      = sideToMoveExpected       if White is to move
whiteExpected      = 1 - sideToMoveExpected   if Black is to move
```

Measured UCI examples:

| Position | UCI WDL | Interpretation |
| --- | --- | --- |
| Starting position, White to move | `wdl 56 938 6` | White expected `0.525` |
| After `1.e4`, Black to move | `wdl 14 962 24` | Black expected `0.495`, White `0.505` |

An earlier interpretation of the second line as `0.75` was wrong and was
corrected: the counts belong to the side to move, not to White.

If WDL is absent or disabled, the configurable centipawn fallback is used:

```text
expected = 1 / (1 + exp(-slope * whiteCentipawns))
```

The default `slope` is `0.00368208` (approximately matching Stockfish WDL near
small advantages); `+29` cp gives about `0.527`. Values are clamped to `[0, 1]`.
Mate scores are kept exact (`+mate → 1`, `-mate → 0`, and side-to-move checkmate
mapped from the FEN). Invalid or missing data falls back to `0.5`, never to
`NaN`, `Infinity` or a fabricated evaluation. Player-specific expected points
are obtained by converting White's value for Black (`1 - whiteExpected`).

### Deterministic classification

Labels come from our own documented heuristics, not from Stockfish. Thresholds
are expected-points losses unless otherwise stated. The first matching rule
wins:

| Priority | Rule | Label | Condition |
| ---: | --- | --- | --- |
| 1 | Forced move | Best | Only one legal move; no alternative can be evaluated |
| 2 | Missed win | Missed win | Before ≥ `0.90`, after ≤ `0.60`, loss ≥ `0.28`; not uncertain |
| 3 | Blunder | Blunder | Loss ≥ `0.32` |
| 4 | Mistake | Mistake | Loss ≥ `0.16` |
| 5 | Inaccuracy | Inaccuracy | Loss ≥ `0.07` |
| 6 | Brilliant sacrifice | Brilliant | Engine best, not forced/recapture/promotion, material delta ≤ `-2`, loss ≤ `0.08`, after ≥ `0.60`, gain ≥ `0.08` or after ≥ `0.85`; not uncertain |
| 7 | Great tactical move | Great | Engine best, not recapture, loss ≤ `0.08`, before ≤ `0.85`, after ≥ `0.75`, gain ≥ `0.10`, and capture/promotion/check or ≥ `25` legal moves; not uncertain |
| 8 | Engine best | Best | Matches the top move and loss ≤ `0.02` |
| 9 | Excellent | Excellent | Loss ≤ `0.05` |
| 10 | Otherwise | Good | No stronger positive or negative rule matched |

Negative thresholds are multiplied by `1.5` when an evaluation is uncertain
(missing best move/score or shallower than requested), and special positive
labels plus missed win are withheld. Brilliant requires a conservative
material commitment and a favorable/improving evaluation; ordinary recaptures,
forced moves and unresolved sacrifices never receive it. **Book** remains in
the type but is deferred because the app has PGN-level opening metadata, not a
move-by-move opening database.

### Accuracy

Accuracy is transparent and independent per player; it is not a copy of
Chess.com's proprietary formula. For each player:

```text
countedMoves = non-forced moves by that player
loss_i       = max(0, expectedPointsBefore_i - expectedPointsAfter_i)
accuracy     = 100 * (1 - sum(loss_i) / countedMoves)
```

`expectedPointsBefore` and `expectedPointsAfter` are converted to the mover's
perspective. Forced moves are skipped and reported separately. A player with
zero counted moves gets `100%`. Results are clamped to `0–100%`. Mate,
short games and resignation use the evaluated position values; no synthetic
loss is added.

### UI and reliability

`FullGameAnalysisPanel` provides the explicit **Analyze full game** / **Analyze
again** action, preset buttons, an `aria-live` progress region with analyzed
count and cancel button, retry on error, duration/warning text, and the
`MoveInspector` with eval before, eval after, best move, expected-points change,
depth, SAN/UCI PV and reasons. In Phase 5, accuracy and counts moved to
`ReviewSummary`, and `MoveList` shows accessible classification indicators tied
to the selected game through the keyed host.

### Measured browser verification (Phase 4)

A production `next start` build on `127.0.0.1:3001` was driven with Chrome
`157.0.8103.79` headless via Chrome DevTools Protocol. A complete 20-ply PGN
ending `1-0` was pasted through the real UI. The pre-analysis panel showed
`Not started`, confirming there was no auto-start. After choosing **Quick · 12**
and clicking **Analyze full game**, the panel reported:

```text
WHITE ACCURACY 99.9%
BLACK ACCURACY 99.7%
20 moves · 21 positions · 12 depth · 804 ms
```

The engine identity was `Stockfish 19 Lite WASM`, and the page loaded
`/engine/stockfish-19-lite-single.js` as a real Worker asset. Move-list
indicators (`★` / `✓`) were present. A repeat run completed in `874 ms`.
These are warm local-machine measurements; deeper presets take longer.

## Interactive game review (Phase 5)

Phase 5 is presentation over the existing Phase 4 result. It does not add
analysis algorithms, change classification or accuracy, start a second engine,
or reanalyze moves when the user navigates. `useGameViewer` remains the single
authoritative game ply; `useVariation` is an explicitly non-persistent overlay.

### Architecture

| File | Role |
| --- | --- |
| `src/lib/review/evaluation.ts` | Shared saturation, mate labels, plotting value and graph-point builder |
| `src/components/review/evaluation-graph.tsx` | Interactive SVG graph; click/keyboard navigation |
| `src/components/review/evaluation-bar.tsx` | Vertical bar beside the board |
| `src/lib/review/annotations.ts` | Validated arrows, square highlights and shared arrow colors |
| `src/components/review/board-review-hints.tsx` | Board-adjacent significant-move header and arrow legend |
| `src/lib/review/explanations.ts` | Plain-language, engine-grounded move and swing descriptions |
| `src/lib/review/variation.ts` | UCI→SAN/FEN validation with rejection index |
| `src/hooks/use-variation.ts` | Identity-keyed variation step overlay, reset on game/PV change |
| `src/components/review/variation-viewer.tsx` | PV notation, step controls and return-to-game |
| `src/components/review/move-inspector.tsx` | Grounded move facts from the Phase 4 `MoveAnalysis` |
| `src/lib/review/key-moments.ts` | Deterministic turning-point and strongest-move selectors |
| `src/components/review/review-summary.tsx` | Accuracy, counts, result, metadata and clickable moments |
| `src/components/review/review-workspace.tsx` | Composition and synchronization point |
| `src/components/game/game-viewer.tsx` | Slim shell: keyboard navigation, preset identity and keyed analysis host |

`FullGameReviewHost` is still keyed by game/settings identity. Changing game or
depth remounts analysis state and clears the old graph, annotations, inspector
and navigation overlay. Navigation from the graph, move list, navigation
buttons or key moments always calls the same `selectPly`, which exits any
variation overlay before moving the authoritative ply.

### Graph scaling

Both the graph and the bar call `evaluationPlotValue`, so they cannot disagree:

```text
|v| <= 4 pawns: plot = v
|v| >  4 pawns: plot = sign(v) * (4 + 6 * (1 - exp(-(|v| - 4) / 4)))
mate:          plot = sign(mate) * 9.5, with a diamond marker and M-label
axis:          [-10, +10] White pawns; White advantage is above centre
```

Centipawns are divided by 100 and normalized to White perspective before
plotting. Large advantages saturate smoothly instead of stretching the axis.
Mate is never plotted as an ordinary centipawn score; `M2` means mate in two
fullmoves, derived from the engine's ply count. Missing evaluations become a
neutral point and are visually de-emphasized, never invented. The graph
includes the initial position (ply 0), every analyzed ply and the final
position, even if an intermediate evaluation is absent. Classification tones
color the points, and the selected point gets a vertical guide. Hovering or
focusing shows that position's evaluation; clicking or pressing Enter/Space
navigates. It is a hand-built responsive SVG; no chart library was added.

### Evaluation bar

`whiteBarShare = clamp(0.5 + plotValue / 20, 0, 1)`. For white orientation the
bar is Black (top) / White (bottom); flipping the board reverses the segments.
Equal and missing evaluations both show 50/50, but missing data is labelled
`Evaluation unavailable` through `aria-valuetext` rather than implying a real
score. Mate positions show `M<n>` on the winning side. The bar reads the same
`PositionEvaluation` as the graph at the authoritative ply; while browsing a
variation it deliberately keeps the game position's evaluation.

### Board annotations

`react-chessboard` 5.12.4 already exposes `arrows` and `squareStyles`; those
controlled options are used with dragging and free drawing disabled. A played
move is yellow, the engine best move is violet and the active variation move is
blue, each with origin/destination highlights. Every arrow is validated against
the displayed FEN with the existing `validateUciMove`, so a stale best move is
silently dropped. Variation moves take priority over game annotations; at most
two arrows are ever shown so the board remains readable. Arrows are cleared
explicitly by changing derived props, not by allowing the board to mutate game
state. The arrow colors are exported and reused by a compact board-adjacent
legend, so the visible swatches cannot drift from the actual arrows.

For notable classifications only, a small header beside the board shows the
label, the side, the move played and one plain-language sentence such as
`Blunder — Black played g6 — This sharply reduced Black's chances`. Ordinary
Good, Excellent and Book moves get no banner. While browsing a variation the
classification header is suppressed, leaving only the variation legend so the
overlay cannot be mistaken for a game move.

### Variation viewer and validation

The engine PV from the selected move is validated from that move's **resulting**
FEN with `validateVariation` and then replayed token-by-token with
`validateUciMove`. Castling, promotion and en passant go through chess.js; the
first illegal token sets `rejectedAt` and truncates the line. Each step carries
SAN plus `fenBefore`/`fenAfter`, so the board, arrow and notation all agree.
`useVariation` stores the step index together with the base-FEN/PV identity;
changing the selected move or game presents index 0 without an effect-driven
extra render. `Step into line`, move buttons, `Next`, `Previous` and
`Return to game` never call `useGameViewer`, so the PGN and game history are
unchanged. Move numbering accounts for a Black-to-move start (`1... e5 2. Nf3`).

### Summary and key moments

`ReviewSummary` shows White/Black accuracy, result, move/position counts,
depth, opening/ECO metadata and counts for Brilliant, Great, Inaccuracy,
Mistake, Blunder and Missed win. Book remains in the type but is never emitted.
Key moments are deterministic and data-driven, in priority order:

1. Biggest blunder — highest expected-points loss among blunders.
2. Missed win — highest expected-points loss among missed wins.
3. Brilliant move — strongest expected-points result among brilliant moves.
4. Largest evaluation swing — largest `|expectedPointsWhite(after) - before|`.
5. Critical defensive move — low pre-move expected points (≤ 0.45), loss
   ≤ 0.05, Best/Great/Excellent label.

A ply appears at most once; empty categories produce no card. Biggest losses
sort by expected-points loss; strongest moves require ≤ 0.05 loss and a
positive label. Every summary row is a button that navigates to that ply.
Key-moment details and the board header use `describeMoveClassification` and
`describeEvaluationSwing`, which describe chances, the engine's preferred move
and balance shifts without requiring engine-score knowledge. The inspector
keeps the raw engine facts in an `Engine detail` line (scores, best move, loss,
depth, PV, reasons and capture/promotion/sacrifice/forced flags); no tactical
narrative is invented.

### Responsiveness and performance

On desktop the board and graph occupy the main column with analysis controls in
a sidebar; below `lg` everything stacks in one narrow column. The board uses a
bounded `max-w-[620px]` container and the SVG scales to its parent. Graph
points and board options are memoized; navigation only changes derived
selections, never starts a search. One shared engine worker remains in use.
There is no chart dependency and no extra animation beyond the existing board
move transition.

### Measured browser verification (Phase 5)

Verified against the production build served with `PORT=3010 pnpm start`, using
headless Google Chrome 157.0.8103.79 with a dark color scheme, reduced motion
and blocked service workers. A 20-ply Ruy Lopez/C60 PGN was imported through
**Paste PGN**, analyzed with **Quick · 12**, and reached the **Analyze again**
state in 871 ms in the REA scenario and 954 ms / 956 ms in the post-audit
desktop / mobile Playwright runs. No console or page errors were recorded.

- REA controlled browser scenario: `ev_9144168b5ac39765bae0e58e7ca30cde762b58e25f78f02cc603f6a8ad48db18`, completeness `complete`.
- Navigation: clicking `button[data-ply='1']` updated the inspector; clicking
  graph point `g[data-ply='8']` set both `aria-pressed` on the graph and
  `aria-current="step"` on the move list to ply 8, with the label
  `Move 4… · Nf6`. Clicking a key moment synchronized graph and move list to
  ply 16.
- Variation overlay: `Step into line`, `Next` and `Return to game` worked; the
  status read `Viewing engine variation · move 2 of 9. The game itself is
  unchanged.`, the blue variation arrow was present, and the game move stayed
  on ply 8 throughout. Board DOM contained the yellow played arrow
  (`e8-g8`) and violet engine arrow (`h2-h3`).
- Board hints: after selecting ply 1 the board-adjacent strip read
  `★ Best — White played e4 — This matched the engine's top move.` with legend
  `Played move / Engine choice`. During a variation it switched to
  `Variation step` and hid the game-move classification, matching the rendered
  arrow and avoiding ambiguity.
- Eval bar: `role="meter"` reported `aria-valuetext="White 52%, Black 48%"`
  and `aria-valuenow="52"`. After **Flip board**, the white segment became the
  first/top segment.
- Summary DOM: `1-0 · White won`, White accuracy `99.9%`, Black accuracy
  `99.7%`, `20 moves · 21 positions · 12 depth`, `Ruy Lopez C60`, and key
  moments `Largest evaluation swing 16. O-O...` and
  `Critical defensive move 20. Nbd7...`. Graph accessible label reported
  `Evaluation graph, 21 positions, White above the centre line`.

| Viewport | Document width | Horizontal overflow | Board / bar | Graph | Key moments |
| --- | --- | --- | --- | --- | --- |
| 1440 × 900 | `scrollWidth = clientWidth = 1440` | none | 600 × 600 board with 20 × 600 bar beside it | 802 × 224 | sidebar at x=985, width 326 |
| 390 × 844 | `scrollWidth = clientWidth = 390` | none | 316 × 316 board with 16 × 316 bar | 332 × 176 | stacked at x=29, width 332 |

## Local persistence, sharing and portability (Phase 6)

Phase 6 adds local durability around the existing Phases 1–5 behavior. It does
not change classification, accuracy, the engine build or the authoritative ply
state. All saved data stays in the browser; sharing and export are explicit user
actions.

### Persistence architecture

`src/lib/storage/` uses native IndexedDB — database `movelens`, version `1`,
object store `reviews` — with no `idb` or Dexie dependency. A record contains:

- `schemaVersion: 1`, deterministic `id`, and creation/update/last-access times.
- A compact `GameSnapshot`: normalized PGN, import source, game count and game index.
- Analysis settings (preset, depth, expected-points and classification thresholds).
- A complete `FullGameAnalysis` snapshot or `null`, plus `analysisState` and
  optional last-progress counts.

Moves, metadata and FENs are rebuilt with the existing `parsePgn` / `importPgn`
pipeline on read instead of being duplicated in storage. Chess.com games use a
stable `chesscom:<type>:<gameId>` ID; pasted/file games use a conservative hash
of initial FEN, normalized PGN and game index. Unversioned legacy records are
migrated to v1; newer schema versions are rejected with an explicit error. One
damaged record is skipped during listing rather than hiding the rest of the
library.

Every imported game is normalized with `withReviewId()` **before** analysis so
the engine's identity key matches the persisted ID. On restore, a snapshot is
accepted only when
`analysis.identity.key === createAnalysisIdentity(game, settings).key`;
mismatched or structurally damaged snapshots are dropped and shown as
incomplete, never as a completed review.

When an import resolves to an existing deterministic ID, the candidate record
is compared with the saved record using `updatedAt`, analysis completeness
(including partial progress) and analysis settings. A replacement is automatic
only when the incoming record is not older, not less complete and uses the same
settings. Otherwise a confirmation explains the specific risk, with **OK** to
replace and **Cancel** to keep the saved record untouched. A confirmed
review-file import keeps the file's `createdAt`, `updatedAt` and
`lastAccessedAt` values so provenance is not rewritten.

### Saved games and reviews

The **My reviews** entry appears in the import view when at least one saved game
exists and beside the board while a game is open. Opening it lists players,
result, date, ply count, last-opened date and one of four states: *Not analyzed*,
*Interrupted*, *Incomplete* or *Reviewed*. *Open* restores the game and any
valid completed analysis; *Delete* asks for confirmation, and *Clear all saved
games* uses an in-panel confirmation step. Import, share-link load and export
import all auto-save. Analysis start, completion, cancellation and failure events
update the corresponding record.

### Share links

**Copy share link** and native **Share** generate
`#review=v1.<g|p>.<base64url>`:

- `g` is gzip via `CompressionStream`; `p` is plain base64url. Gzip links are
  created only when both `CompressionStream` and `DecompressionStream` exist, so
  a browser never emits a link it cannot decode.
- The payload contains `v`, PGN, preset, depth, minimal player/date/result
  metadata and, for Chess.com games, only game type and ID. It contains **no
  analysis snapshot**, username, game URL, account data or server reference.
- The fragment is not sent in the HTTP request to the site. The recipient
  reconstructs the game locally and analyzes it with their own browser engine.
- Generation is capped at **8,000 URL characters** and **300,000 PGN
  characters**; oversized games are told to export a review file instead.
- Opening validates version, encoding, base64url characters, JSON shape,
  settings, PGN and single-game content. Malformed, unsupported, oversized,
  compressed-over-1,000,000-byte and multi-game links produce clear errors. An
  unsupported browser opening a gzip link is told to request a plain link or an
  exported review file instead of failing silently.

### Export and import

**Export review** / **Export game** download a versioned JSON bundle:
`format: "movelens-review"`, `version: 1`, `exportedAt`, and the same stored
review record. A completed analysis may be included; a game-only export has
`analysis: null`. The **Review file** import tab reads the file locally and
validates format/version, JSON size (20,000,000 characters), storage schema,
PGN, settings and analysis identity before it saves or displays anything. Share
links and review bundles are deliberately distinct: a link restores only a
game, while a bundle may carry a completed review.

### Browser and deployment requirements

Saved reviews need IndexedDB. Analysis needs Web Workers, WebAssembly,
`MessageChannel`, `AbortController` and `Intl`. Import/export and sharing also
need `File.text()`, `Blob`/`Response` streams, `URL`, `TextEncoder`/`TextDecoder`
and `atob`/`btoa`. Plain share links work without compression APIs. Creating
gzip links requires **both** `CompressionStream` and `DecompressionStream`;
opening a gzip link requires `DecompressionStream` and otherwise shows an
explicit error. No extra sharing dependency is added. The single-threaded
Stockfish build does **not** need `SharedArrayBuffer`, COOP or COEP headers.

Production must run `pnpm build` followed by `pnpm start` because the Chess.com
import route is server-side; a static export is not available without replacing
that feature. `CHESSCOM_API_CONTACT` remains optional and only affects the
upstream `User-Agent`. See [PRIVACY.md](./PRIVACY.md),
[SECURITY.md](./SECURITY.md) and
[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for data, validation and
licensing details.

### Measured browser verification (Phase 6)

Verified against the production build (`PORT=3010 pnpm start`) in headless Google
Chrome `157.0.8103.79` at `1440 × 900` and `390 × 844`, with dark color scheme,
reduced motion and service workers blocked. `Worker` construction and
`postMessage` were instrumented before page load, so engine traffic was observed
rather than inferred from UI text.

| Measurement | Desktop | Mobile |
| --- | ---: | ---: |
| Paste-import to “saved in this browser” | 85 ms | 945 ms |
| First Quick · 12 full analysis to “Analyze again” | 1,339 ms | 2,223 ms |
| Reload → My reviews → Open completed review | 96 ms | 460 ms |
| Separate-context share-link analysis | 1,377 ms | 1,370 ms |
| Horizontal document overflow | 0 px | 0 px |
| Console/page errors | 0 | 0 |

Additional observed evidence:

- First analysis created exactly **1** Worker and sent **21** `go depth 12`
  searches for 20 plies (N+1). Before analysis there were 0 workers and 0 searches.
- Reopening the saved review in a fresh page reported
  “Saved review restored without rerunning analysis”, showed **Analyze again**,
  and recorded **0** workers and **0** `go` commands. A mobile header overflow
  found during the first pass was fixed; the final run had `scrollWidth =
  clientWidth` on both viewports.
- Copy share link produced a compressed `review=v1.g.…` fragment of **410**
  characters, and the native **Share** button was present. A separate browser
  context opened that link locally, showed “Shared game loaded locally”, and
  analyzed with its own single Worker (21 searches).
- Export downloaded `movelens-review-Alice-Bob.json` (185,652 bytes desktop;
  185,610 mobile) with `format: movelens-review`, versions `1`/`1`,
  `analysisState: complete` and 20 stored moves. Importing it into another
  fresh context restored “Analyze again” with **0** engine searches.
- With two saved rows, per-game delete showed the confirmation
  “Delete this saved game and its analysis from this browser?”; confirmed
  clear-all left **0** IndexedDB records. Summary text showed 99.9% / 99.7%
  accuracy and `20 moves · 21 positions · 12 depth`.

## Requirements

- Node.js 22.12+, 24+, or 26+ (Vitest 5 requirement; Next.js 16 needs 20.9+)
- pnpm 11+
- A current browser with IndexedDB, Web Workers, WebAssembly, `MessageChannel`,
  `File.text()`, `Blob`/`Response` streams, `URL`, `TextEncoder`/`TextDecoder`,
  `atob`/`btoa`, `AbortController` and `Intl`. Plain share links need no
  compression APIs; gzip links need both `CompressionStream` and
  `DecompressionStream` to create and `DecompressionStream` to open.
- Outbound HTTPS from the Next.js server to `api.chess.com` for Chess.com import only

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

For production (required because `/api/import/chesscom` is a server route):

```bash
pnpm build
CHESSCOM_API_CONTACT="you@example.com" pnpm start
```

Chess.com import needs outbound HTTPS access from the Next.js server to
`api.chess.com`. File, paste and review-file imports, persistence, sharing and
export stay browser-local. No secrets or API keys are required; do not put
credentials in `CHESSCOM_API_CONTACT`. Serve the self-hosted engine files under
`public/engine/` with their normal JavaScript/WASM MIME types. Static hosting
via a pure `output: "export"` build is not supported while the Chess.com route
is part of the product.

## Scripts

```bash
pnpm dev        # development server
pnpm build      # production build
pnpm start      # run the production build
pnpm lint       # ESLint
pnpm typecheck  # TypeScript (strict, no emit)
pnpm test       # unit and integration tests (mocked HTTP and Worker I/O)
```

## Architecture

```text
src/
  app/
    api/import/chesscom/route.ts  typed server route for Chess.com retrieval
    page.tsx / layout.tsx         App Router entry points
  components/
    ui/                           local Button, Card, Badge, Alert, Textarea
    import/                       import tabs, PGN/review-file entry, multi-game picker
    game/                         board, move list, navigation, saved-review panel, engine panels
    review/                       graph, bar, annotations, PV viewer, summary, share/export actions
    analysis-workspace.tsx        active review, save/restore, share and bundle lifecycle
  hooks/
    use-game-viewer.ts            authoritative ply state and navigation callbacks
    use-engine-analysis.ts        worker-backed single-position analysis state
    use-full-game-analysis.ts     restored result, run state, abort, generation guards and events
    use-variation.ts              non-persistent, identity-keyed PV overlay state
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
    engine/
      types.ts                    engine, UCI, evaluation and progress contracts
      errors.ts                   stable engine error codes
      uci.ts                      typed UCI parsing and score normalization
      chess-moves.ts              chess.js move/PV validation
      worker-transport.ts         Worker string transport and download progress
      stockfish-service.ts        serialized UCI service, abort and WDL parsing
      shared-engine.ts            ref-counted Strict Mode-safe worker lifecycle
    analysis/
      types.ts                    full-game, position, move and accuracy contracts
      settings.ts                 presets, thresholds and analysis identity
      positions.ts                N+1 replay from the real initial FEN
      expected-points.ts          WDL/logistic expected points and perspectives
      classification.ts           deterministic labels and priority order
      accuracy.ts                 independent player accuracy formula
      full-game-service.ts        sequential runner, progress, cache and guards
      labels.ts                   shared UI labels and symbols
      errors.ts                   stable full-game error codes
    review/
      evaluation.ts               shared scaling, mate handling and graph data
      annotations.ts              validated arrows and square highlights
      variation.ts                UCI PV validation, SAN and FEN steps
      key-moments.ts              deterministic turning-point selectors
    storage/
      schema.ts                   versioned records, IDs, migration, validation and load
      review-store.ts             native IndexedDB and in-memory test store
    share/
      review-share.ts             bounded hash encoding/decoding and local game restore
    export/
      review-bundle.ts            versioned JSON export and validated import
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
- **Stockfish 19 Lite WASM (GPL-3.0)** self-hosted from `stockfish@19.0.1`. It
  runs as one shared, single-threaded Worker; the React main thread never
  searches, and no engine assets come from a CDN.
- **One import pipeline.** Chess.com retrieval only produces a PGN and source
  metadata; parsing, multi-game handling and viewing stay shared with Phase 1.
- **No arbitrary fetch URL.** The browser calls a local typed route; the server
  constructs official API URLs and validates returned archive URLs.
- **Browser-native persistence.** Native IndexedDB v1 stores compact, versioned
  records; no third-party database dependency and no server-side user database.
- **Deterministic review identity.** Chess.com IDs or PGN/FEN hashes let the
  same game be saved, reopened and updated; restored analysis is identity-checked.
- **Hash-fragment sharing.** PGN and minimal settings travel in the URL fragment,
  optionally gzipped and always size-capped; the recipient analyzes locally.
- **Portable JSON bundles.** Exports may include a completed analysis; imports
  validate format, schema, PGN, settings and analysis identity before use.
- **No backend persistence, accounts, analytics or telemetry.** The only server
  responsibility is the local Chess.com public-data retrieval route.

## Dependencies

Runtime: `next`, `react`, `react-dom`, `chess.js`, `react-chessboard`,
`clsx`, `tailwind-merge`, `class-variance-authority`, `@radix-ui/react-slot`,
`lucide-react`, plus the self-hosted GPL-3.0 engine files in `public/engine/`
(not npm dependencies).

Development: `typescript`, `eslint`, `eslint-config-next`, `tailwindcss`,
`@tailwindcss/turbopack`, `@types/*`, `vitest`, `jsdom`,
`@testing-library/react`.

## Testing and verification

`pnpm typecheck`, `pnpm lint`, `pnpm test` (**35 files, 215 tests**) and
`pnpm build` all pass. Automated tests mock external HTTP and Worker I/O; they
never depend on the live Chess.com API or a bundled engine binary. Coverage
includes URL/username validation, archive ordering and exact-ID matching,
missing variants/PGNs, upstream 404/410/429/5xx, timeouts, invalid JSON, route
status mapping, successful Chess.com import into the existing viewer, move
navigation, continued PGN import, and preservation of a loaded game after a
failed import. Engine tests cover UCI line parsing, WDL parsing, score
normalization, mocked-Worker initialization/search/stop/termination/retry,
MultiPV, black-to-move scores, mate scores, promotion/castling/en passant
validation, illegal output, Strict Mode-style remounts, navigation stale-result
rejection, and panel controls.

Phase 4 tests additionally cover N+1 position generation from standard and
custom FEN, black-to-move starts, short/long games, terminal positions,
WDL/centipawn/mate expected points and perspective conversion, every
classification threshold and priority, conservative full-FEN caching, sequential
searches with no overlap, progress emission, cancellation, engine failure and
retry, reanalysis, game switching, stale-result rejection, explicit-no-autostart
UI controls, progress/cancel rendering, accuracy/counts summary and selected-move
inspection.

Phase 5 tests additionally cover linear/saturated evaluation scaling, mate
labeling and bounded plotting, identical bar/graph normalization, missing and
incomplete analysis, graph click/keyboard navigation, evaluation-bar orientation
and unavailable state, played/best/variation arrows with FEN validation, illegal
arrow rejection, UCI→SAN conversion including castling/promotion/en passant,
illegal PV truncation, black-to-move numbering, variation navigation/reset and
return-to-game, data-driven key moments with empty categories, review summary
navigation, and one authoritative ply across board, move list, graph and key
moments including game switching. The UI audit refinements add tests for
significant-move-only board headers, arrow legends derived from rendered arrows,
variation-only legends, and plain-language move/swing explanations that contain
no raw engine coordinates or expected-points wording.

Phase 6 tests additionally cover stable and content-sensitive review IDs, JSON
round-trips of completed analysis, store save/update/touch/delete/list, corrupt
and future-schema rejection, legacy migration, mismatched-analysis rejection,
gzip/plain share encoding and decoding, missing/one-sided compression globals,
clear compressed-link capability errors, malformed/unsupported/oversized and
multi-game links, decompression caps, bundle format/version/PGN/analysis checks,
import-collision comparison and timestamp provenance, replace/cancel UI flows,
saved-review UI restore/share/import/delete/clear flows, single-run guard
recovery after replay failure, overlapping-run rejection, and restored results
that do not start an engine search.

A live production-server integration check was performed against the official
API: `POST /api/import/chesscom` with
`https://www.chess.com/game/live/184727190848` and username `hikaru` returned
HTTP 200 with the exact game ID, `rules: "chess"`, and a 3,619-character PGN
that passed the existing parser. The real browser WASM checks described in
[Local Stockfish analysis](#local-stockfish-analysis-phase-3) used both a local
static server and the production `next start` build with the actual UI. The
Phase 4 full-game check described in
[Full-game review](#full-game-review-phase-4) also used the production build
and the actual import/review UI with the local Stockfish WASM worker; mocks
alone were not treated as completion evidence.

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
- Saved reviews are local to one browser profile. There is no cloud sync,
  account recovery or automatic backup; clearing site data removes them.
- The single-position engine panel still follows the displayed position;
  navigating clears that panel's evaluation, best move and PV. Full-game review
  results stay attached to the loaded game and settings until they change.
- Full-game analysis uses `MultiPV 1`. With only one principal variation,
  complexity heuristics for Great moves are intentionally conservative.
- Book classification is deferred: PGN headers may name an opening, but there
  is no local move-by-move opening database to justify a Book move.
- Accuracy and labels use the documented formulas/heuristics above; they are
  not Chess.com's proprietary values. Uncertain, shallow or incomplete
  engine data withholds special labels.
- The graph plots mate at a bounded ±9.5 pawns with a distinct marker; it does
  not put mate on the same numeric scale as centipawns.
- Only one engine PV is available (`MultiPV 1`), so alternative-move arrows are
  not shown. The variation viewer follows the top line only.
- The graph connects adjacent analyzed plies; a missing evaluation is drawn as
  a neutral point rather than interpolated or fabricated.
- Review highlights use expected-points data only. There is no validated
  natural-language tactical explanation engine.
- Share links hold one game only, contain no analysis snapshot, and are capped
  at 8,000 URL characters; larger games require a review-file export.
- Share links are readable by anyone who has the URL and are not encrypted or
  signed. Export files are plain JSON and are not authenticated; importing one
  with a matching deterministic ID can replace a saved review, but a newer,
  more complete or differently configured local review now requires explicit
  confirmation and cancellation preserves it.
- Browser storage is subject to quota and eviction. Imported records are
  validated and size-capped, and compressed share links have a decode cap, but
  very large local libraries still depend on browser capacity.
- The Chess.com route requires a running Next.js server and outbound HTTPS;
  static-only deployment would need that feature removed or replaced.
- Opening explorer, online databases, accounts, cloud engine, paid APIs,
  subscriptions, social features and online multiplayer are out of scope.
- Search time is device-dependent. Full-game Deep analysis and single-position
  Depth 20 can take noticeably longer on slower CPUs; the single-threaded build
  does not use `SharedArrayBuffer`.
- The engine is GPL-3.0 and self-hosted; public redistribution must satisfy the
  source-notice obligations in `public/engine/ENGINE_LICENSES.md`.

## Disclaimer

MoveLens is an independent project and is **not affiliated with, endorsed by,
or sponsored by Chess.com**. Chess.com is a trademark of its respective owner.
This project uses only Chess.com's public Published-Data API and does not
reproduce or store private account data.
