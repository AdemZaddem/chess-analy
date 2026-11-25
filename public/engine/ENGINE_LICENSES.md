# Stockfish engine assets — license and provenance

This directory contains the self-hosted Stockfish engine used by MoveLens.

## Engine identity

| Item | Value |
| --- | --- |
| Engine | Stockfish 19 Lite WASM |
| Stockfish.js release | 19 (npm package `stockfish@19.0.1`) |
| Build variant | Lite, single-threaded WebAssembly |
| Copyright (stockfish.js wrapper) | (c) 2026, Chess.com, LLC |
| Copyright (Stockfish engine) | (c) T. Romstad, M. Costalba, J. Kiiski, G. Linscott and other contributors |
| NNUE network | `nn-61e7af4bb97d.nnue` by Chris Bao (sscg13) |
| License | **GPL-3.0** (not MIT) |

## Files

| File | Size | SHA-256 |
| --- | ---: | --- |
| `stockfish-19-lite-single.js` | 28,230 bytes | `ccb130d7ff29408531c47d859a49f91d59d4f482d05a53eb1a3231a4f624c91a` |
| `stockfish-19-lite-single.wasm` | 1,845,971 bytes | `ee4f115bdb2d32cadf96cada104a05b5ec257d7ad6f57582190b49bc71f096de` |
| `COPYING.txt` | 35,149 bytes | Full GNU GPL v3 text |

The JavaScript header copyright and GPL notice are preserved verbatim. The
WASM binary was not modified. The JS wrapper derives the WASM URL from its own
path (`stockfish-19-lite-single.js` → `stockfish-19-lite-single.wasm`) and
hard-codes the expected WASM byte length `1845971`, which matches the supplied
WASM file exactly. Local execution confirmed the engine identifies itself as
`Stockfish 19 Lite WASM`, exposes `Threads` as `1..1`, and completes UCI
initialization and a real search.

## Source and version references

- npm package: <https://www.npmjs.com/package/stockfish/v/19.0.1>
- Stockfish.js source: <https://github.com/nmrugg/stockfish.js>
- Upstream Stockfish source: <https://github.com/official-stockfish/Stockfish>
- NNUE network: <https://tests.stockfishchess.org/nns?network_name=nn-61e7af4bb97d>
- GPL v3: <https://www.gnu.org/licenses/gpl-3.0.txt>

The corresponding source for the exact released version is the
`stockfish@19.0.1` package / `nmrugg/stockfish.js` repository at the matching
version, together with the official Stockfish 19 source referenced above.

## Distribution obligations

These engine assets are GPL-3.0 licensed. If you publicly distribute this
application, including these assets in a public `public/` directory:

- keep the copyright and license notices in the JavaScript file;
- keep this license/provenance documentation and `COPYING.txt` available;
- provide access to the Corresponding Source for the exact engine version, or
  a valid written offer as described in GPL v3 section 6;
- do not describe the engine as MIT licensed;
- if you modify the engine files, mark the modifications clearly and keep the
  GPL notices intact.

This document is information, not legal advice. No assumption is made that
bundling, separating, or loading the engine at runtime changes GPL obligations.
