// Syncs the sibling chess apps into this repo so the whole suite is served
// from one origin (shared IndexedDB/localStorage, unified nav):
//
//   C:/Users/Admin/stockfish          -> public/play/     (Chess Interface)
//   C:/Users/Admin/ChessGym           -> public/gym/      (ChessGym trainer)
//   C:/Users/Admin/ChessMoveReviewer  -> public/review/   (Chess Reviewer)
//   C:/Users/Admin/yourchesspuzzles   -> public/puzzles/  (Your Chess Puzzles)
//
// Each app keeps its own repo; run `npm run sync-apps` after changing them,
// then commit here (or use that app's own deploy.bat, which does both). The
// copied index.html gets the suite nav injected. App registry lives in
// suite-apps.mjs, shared with deploy.mjs.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { suiteApps } from './suite-apps.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const siblings = resolve(repoRoot, '..');

const SUITE_TAGS =
  '<script src="../suite/nav.js" defer></script>\n  <script src="../suite/bridge.js" defer></script>';

const APPS = suiteApps(siblings);

let totalBytes = 0;
let totalFiles = 0;

function copyEntry(srcPath, destPath, skip) {
  if (skip?.(srcPath)) return;
  const st = statSync(srcPath);
  if (st.isDirectory()) {
    mkdirSync(destPath, { recursive: true });
    for (const child of readdirSync(srcPath)) {
      copyEntry(join(srcPath, child), join(destPath, child), skip);
    }
  } else {
    cpSync(srcPath, destPath);
    totalBytes += st.size;
    totalFiles++;
  }
}

function injectNav(indexPath) {
  let html = readFileSync(indexPath, 'utf8');
  if (html.includes('suite/nav.js')) return;
  if (html.includes('</head>')) {
    html = html.replace('</head>', `  ${SUITE_TAGS}\n</head>`);
  } else {
    html = SUITE_TAGS + '\n' + html;
  }
  writeFileSync(indexPath, html);
}

for (const app of APPS) {
  if (!existsSync(app.src)) {
    console.error(`SKIP ${app.name}: source not found at ${app.src}`);
    continue;
  }
  const dest = join(repoRoot, 'public', app.name);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  const before = totalFiles;
  for (const entry of app.include) {
    const srcPath = join(app.src, entry);
    if (!existsSync(srcPath)) {
      console.warn(`  warn: ${app.name}/${entry} missing in source`);
      continue;
    }
    copyEntry(srcPath, join(dest, entry), app.skip);
  }
  injectNav(join(dest, 'index.html'));
  console.log(`${app.title.padEnd(16)} -> public/${app.name}/ (${totalFiles - before} files)`);
}

console.log(`\nSynced ${totalFiles} files, ${(totalBytes / 1024 / 1024).toFixed(1)} MB total.`);
