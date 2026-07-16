// Builds src/data/openings.json — a map from position EPD -> { eco, name }.
// Source: Lichess chess-openings TSVs (a.tsv..e.tsv), columns: eco, name, pgn.
// The EPD key is the first 4 fields of the FEN (placement, turn, castling, ep),
// which uniquely identifies a position regardless of move clocks.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Chess } from 'chess.js';

const here = dirname(fileURLToPath(import.meta.url));

/** Reduce a full FEN to its position-identifying EPD (drops halfmove/fullmove clocks). */
export function fenToEpd(fen) {
  return fen.split(' ').slice(0, 4).join(' ');
}

const map = {};
let total = 0;

for (const file of ['a', 'b', 'c', 'd', 'e']) {
  const raw = readFileSync(join(here, `${file}.tsv`), 'utf8');
  const lines = raw.split('\n');
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const [eco, name, pgn] = line.split('\t');
    if (!pgn) continue;
    const chess = new Chess();
    try {
      // Strip move numbers and result tokens, keep SAN moves.
      const sans = pgn
        .replace(/\d+\.(\.\.)?/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .filter(Boolean);
      for (const san of sans) chess.move(san);
      const epd = fenToEpd(chess.fen());
      // Prefer the more specific (longer) name if a collision occurs, but the
      // dataset is already ordered so later, deeper entries win naturally.
      map[epd] = { eco, name };
      total++;
    } catch (err) {
      console.warn(`skip ${eco} ${name}: ${err.message}`);
    }
  }
}

const outPath = join(here, '..', 'src', 'data', 'openings.json');
writeFileSync(outPath, JSON.stringify(map));
console.log(`Wrote ${Object.keys(map).length} positions (${total} openings parsed) -> ${outPath}`);
