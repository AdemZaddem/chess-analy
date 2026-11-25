# Third-party notices

This project combines the following third-party components. The table reflects
the versions declared in `package.json` and the vendored engine assets. Always
check the `LICENSE` files in the installed packages before redistribution.

| Component | Version | License | Notes |
| --- | --- | --- | --- |
| Stockfish 19 Lite WASM (`stockfish@19.0.1`) | 19.0.1 | **GPL-3.0** | Vendored, unmodified in `public/engine/`. Provenance, hashes and distribution obligations are in `public/engine/ENGINE_LICENSES.md`; full text is in `public/engine/COPYING.txt`. |
| `chess.js` | ^1.4.0 | BSD-2-Clause | PGN parsing, FEN and legality. |
| `react-chessboard` | ^5.12.4 | MIT | Board rendering. |
| `next` / `react` / `react-dom` | 16.4.6 / 19.3.0 | MIT | Framework and UI runtime. |
| `tailwindcss` / `@tailwindcss/turbopack` | 4.3.3 | MIT | Styling build. |
| `@radix-ui/react-slot` | ^1.5.0 | MIT | Primitive used by local UI components. |
| `class-variance-authority`, `clsx`, `tailwind-merge` | ^0.7.1 / ^2.1.1 / ^3.7.1 | MIT | Local UI utility pattern. |
| `lucide-react` | ^1.78.0 | ISC | Icons. |
| `typescript`, `eslint`, `vitest`, `jsdom`, `@types/*` | as declared in `package.json` | MIT / Apache-2.0 / BSD-style | Development tooling only. |

## Application source license

MoveLens is free for users to run and use; no account, subscription or paid API
is required. Free use does not imply a source-code license.

No root `LICENSE` file has been selected for the MoveLens application source.
Do not infer redistribution rights for the application code from this document.
The GPL-3.0 obligations for the bundled Stockfish assets apply separately and
must be honored if those assets are distributed publicly. They do not select a
license for the rest of the application.
