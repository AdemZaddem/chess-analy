# Security notes

MoveLens is a local-first browser application. It has no accounts, passwords,
API keys, backend database, cloud sync or admin surface. The only server-side
code is the local Next.js route that retrieves public Chess.com games.

## Trust boundaries

| Boundary | Controls |
| --- | --- |
| Browser → local Chess.com route | Game URL host/path and game type are parsed with the native `URL` API; usernames are normalized and validated; only `live`/`daily` IDs are accepted |
| Local route → Chess.com | Only `https://api.chess.com/pub/` is allowed; archive URLs returned by the API are host/path validated before fetching; requests are serial and bounded by a timeout |
| File/paste PGN → parser | Existing `chess.js` parser, explicit multi-game handling, size/ply limits for persisted records, and user-visible validation errors |
| Review JSON → importer | `movelens-review` format and version check, 20M-character input cap, structural validation, PGN restore, schema check, and analysis-identity verification |
| Imported review → existing ID | Compares `updatedAt`, analysis completeness/progress and settings; explicit replace/cancel confirmation before a potentially destructive write |
| Share fragment → local game | Version/encoding checks, 8,000-character fragment cap, 1,000,000-byte decompression cap, 300,000-character PGN cap, malformed-payload rejection, single-game enforcement, and a clear `DecompressionStream` capability error |
| Untrusted analysis data | Stored snapshots are reused only when the identity key matches the game and settings; mismatches are dropped and reported, never shown as complete |

Engine input stays local. The Stockfish worker and WASM file are served from the
application origin; there is no CDN runtime fetch and no remote engine service.

## Intentional non-controls

- Share links and exported JSON are **not encrypted or authenticated**. They
  are data carriers, not capability tokens or signed documents.
- Anyone with a share link can read its PGN. See [PRIVACY.md](./PRIVACY.md).
- Importing a review file with a deterministic ID equal to an existing saved
  review can replace that local record. A replacement is automatic only when it
  is not older, not less complete and uses the same settings; otherwise the UI
  asks for confirmation and cancellation preserves the existing record. Export
  before importing an unfamiliar file if preserving the current record matters.
- Saved reviews depend on browser storage. They can be removed by the user or
  the browser and are not backed up or recoverable by MoveLens.
- The Chess.com cache is in-memory and process-local. A public deployment's
  server logs may contain requested URLs/usernames; keep `CHESSCOM_API_CONTACT`
  non-sensitive.

## Reporting concerns

Do not put private game data in a public issue. If the project repository offers
private vulnerability reporting, use it; otherwise contact the maintainer
through a private channel and include reproduction steps without real private
PGNs. This document is operational information, not a security guarantee.
