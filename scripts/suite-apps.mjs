// Shared sub-app registry for the yourlines suite:
//
//   C:/Users/Admin/stockfish          -> public/play/     (Chess Interface)
//   C:/Users/Admin/ChessGym           -> public/gym/      (ChessGym trainer)
//   C:/Users/Admin/ChessMoveReviewer  -> public/review/   (Chess Reviewer)
//   C:/Users/Admin/yourchesspuzzles   -> public/puzzles/  (Your Chess Puzzles)
//   C:/Users/Admin/Sparring           -> public/spar/     (Sparring Coach)
//
// Used by both sync-apps.mjs (copies these into public/) and deploy.mjs (the
// one-click commit+sync+build+push pipeline), so a sub-app is only ever
// registered in one place.
import { join, basename } from 'node:path';

/** Per-app sync config. `include` entries are files or directories. */
export function suiteApps(siblings) {
  return [
    {
      name: 'play',
      title: 'Chess Interface',
      src: join(siblings, 'stockfish'),
      include: [
        'index.html',
        'libs',
        'pieces',
        'sounds',
        // Only the engine builds index.html actually references (~15 MB).
        'stockfish-nnue-16-single.js',
        'stockfish-nnue-16-single.wasm',
        'stockfish-17-lite-single.js',
        'stockfish-17-lite-single.wasm',
        'stockfish-16.1-lite-single.js',
        'stockfish-16.1-lite-single.wasm',
      ],
    },
    {
      name: 'gym',
      title: 'ChessGym',
      src: join(siblings, 'ChessGym'),
      include: [
        'index.html',
        'app.js',
        'style.css',
        'favicon.ico',
        'favicon.png',
        'data',
        'engine',
        'libs',
        'pieces',
        'sounds',
        'Thumbnails',
      ],
      // Dev-side leftovers inside included dirs.
      skip: (p) => /\.bak\d*$/.test(p) || basename(p) === '__pycache__',
    },
    {
      name: 'review',
      title: 'Chess Reviewer',
      src: join(siblings, 'ChessMoveReviewer'),
      include: ['index.html', 'favicon.svg', 'engine', 'sounds'],
    },
    {
      name: 'puzzles',
      title: 'Your Chess Puzzles',
      src: join(siblings, 'yourchesspuzzles'),
      include: ['index.html', 'sync.js', 'libs', 'pieces', 'sounds', 'engine'],
    },
    {
      name: 'spar',
      title: 'Sparring Coach',
      src: join(siblings, 'Sparring'),
      // Everything it has: chess.js and Firebase come from their CDNs, and the
      // pieces are drawn as inline SVG, so there is no asset directory to copy.
      include: ['index.html', 'app.js', 'sounds.js', 'style.css', 'sync.js', 'engine'],
    },
  ];
}
