# yourlines — opening lab

Study **your** chess openings. Pull your real games from Chess.com or Lichess,
see every line you play as a named tree from broad to specific, and let Stockfish
pinpoint where you drift off.

![landing](docs/landing.png)

## What it does

- **Import** — fetches your games straight from the Chess.com and Lichess public
  APIs (no login, no keys). Runs entirely in the browser.
- **Named lines tree** — aggregates your games into an opening tree. Every move is
  labelled with its ECO opening name, refined from general → specific as you go
  deeper (e.g. _Sicilian Defense › Najdorf Variation › English Attack_).
- **Your openings** — the opening families you play most, ranked by frequency with
  your win/draw/loss record and score.
- **Weak spots** — decision points you reach often but score poorly from, flagged
  statistically, then confirmed on demand with **Stockfish** running in-browser.

Separate White and Black repertoires; toggle between them.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
```

Try it with `Hikaru` / `MagnusCarlsen` (Chess.com) or `DrNykterstein` (Lichess).

```bash
npm run build    # typecheck + production bundle
```

## How it's built

| Area            | Choice                                                              |
| --------------- | ------------------------------------------------------------------ |
| App             | React 19 + TypeScript + Vite                                       |
| Styling         | Tailwind v4                                                        |
| Chess logic     | [chess.js](https://github.com/jhlywa/chess.js)                    |
| Board           | [react-chessboard](https://github.com/Clariity/react-chessboard) |
| State           | Zustand                                                            |
| Opening names   | [Lichess chess-openings](https://github.com/lichess-org/chess-openings) dataset, baked into `src/data/openings.json` |
| Engine          | Single-threaded Stockfish 10 WASM (`public/engine/`)               |

### Why single-threaded Stockfish

The multi-threaded builds need `SharedArrayBuffer`, which requires the
`COOP`/`COEP` isolation headers — and those headers would break the cross-origin
`fetch`es to the Chess.com / Lichess APIs. The single-threaded HCE build is
self-contained (no NNUE net file), runs in a plain Web Worker, and is more than
strong enough to judge opening positions.

## Project layout

```
src/
  lib/
    openings.ts     position (EPD) → ECO name lookup + name segmentation
    chessApi.ts     Chess.com + Lichess import → normalised Game[]
    tree.ts         move-tree aggregation, opening summary, weakness detection
    engine.ts       promise-based Stockfish worker wrapper
    chessUtil.ts    UCI → SAN helpers
  hooks/
    useEval.ts      analyse a FEN while enabled
    EvalContext.tsx share one analysis across the board + panels
  components/       Board, LinePanel, OpeningTree, CommonOpenings, Weaknesses, …
  store/useStore.ts app state (games, repertoires, navigation)
  data/openings.json  generated — do not edit by hand
scripts/
  build-openings.mjs  regenerate openings.json from the ECO TSVs
  verify.mjs          smoke-test the pipeline against a live account
  shot.mjs            Playwright screenshot walkthrough
```

### Regenerating the opening names

```bash
node scripts/build-openings.mjs   # reads scripts/{a..e}.tsv → src/data/openings.json
```
