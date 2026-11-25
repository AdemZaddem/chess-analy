# Privacy

MoveLens is local-first. There are no accounts, no analytics or telemetry, no
advertising trackers, and no application database on a server. Full-game
analysis runs in a Web Worker in the visitor's browser.

## Data handled by the application

| Data | Where it is kept | Why | Retention |
| --- | --- | --- | --- |
| PGN text, import source, game index and analysis settings | Browser IndexedDB (`movelens` / `reviews`) | Reopen saved games and restore completed reviews | Until the user deletes the review, clears all reviews, or clears site data |
| Completed full-game analysis | Same IndexedDB record | Reopen a review without rerunning Stockfish | Same as above |
| Created/updated/last-accessed timestamps | Same IndexedDB record | Sort and label saved reviews | Same as above |
| Chess.com game URL and one player username | Sent from the browser to the local Next.js route, then used server-side against the official Published-Data API | Find one public game | Not stored by MoveLens; the server keeps only a process-local conditional-GET cache |
| Share link contents | URL fragment (`#review=…`) | Let another browser reconstruct the game locally | Controlled by the browser and whatever messaging app the user pastes it into |
| Exported JSON review file | Downloaded by the user | Portable backup or transfer | Controlled by the user |

MoveLens does not set authentication or analytics cookies. It does not ask for
a Chess.com login, password, cookie or session token.

## What leaves the device

- **PGN upload, paste and review-file import:** no upload. Files are read with
  `File.text()` and parsed in the browser.
- **Chess.com import:** the browser sends the game URL plus one username to the
  local Next.js server route `POST /api/import/chesscom`. The server queries
  `https://api.chess.com/pub/`. This is necessary because Chess.com does not
  expose a documented single-game endpoint. `CHESSCOM_API_CONTACT`, if set, is
  included only in the upstream `User-Agent`.
- **Share links:** the PGN and minimal settings are encoded in the URL
  fragment. Fragments are not included in normal HTTP requests to the site.
  The recipient's browser decodes the link and analyzes locally; MoveLens does
  not store the link or its PGN on a server. Compressed (`gzip`) links require
  `DecompressionStream`; an unsupported browser receives a clear error and can
  request a plain link or exported review file instead.
- **Export files:** generated locally. The application does not retain a copy.

## Sharing caveat

A share link is privacy-friendly, not confidential encryption. Anyone with the
full link can read the PGN. Browsers may keep it in history, and messaging or
note-taking services may store the entire pasted URL even though the fragment
is not sent to the MoveLens server. Do not share private games unless you intend
to disclose the moves.

Review export files are plain JSON and are not encrypted or signed. Compare the
file with your own records before trusting an imported analysis; MoveLens
validates structure, versions, PGN and analysis identity, but cannot prove who
authored the file. If a file has the same deterministic ID as a saved review,
MoveLens compares timestamps, analysis completeness and settings before writing.
You are asked to confirm a potentially destructive replacement; cancelling
leaves the existing local review unchanged.

## Local storage and deletion

Saved reviews live only in the current browser profile. **My reviews** provides
*Open*, per-game *Delete*, and confirmed *Clear all saved games* actions.
Clearing browser site data, using a different browser/profile, or storage
eviction under pressure also removes them. Export anything you want to keep
before clearing storage.

IndexedDB is required for saved reviews. Private browsing, strict privacy
settings or embedded webviews may block it; the UI then reports a storage error
rather than silently syncing elsewhere.

## Engine and third parties

The bundled Stockfish 19 Lite WASM engine is self-hosted from `public/engine/`;
it performs no network requests. Chess rules come from the local `chess.js`
dependency. See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) and
`public/engine/ENGINE_LICENSES.md` for licensing details.
