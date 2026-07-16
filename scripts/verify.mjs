// End-to-end smoke test of the analytical pipeline against live data.
// Mirrors src/lib logic (tree build, opening naming, weakness detection).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Chess } from 'chess.js';

const here = dirname(fileURLToPath(import.meta.url));
const OPENINGS = JSON.parse(readFileSync(join(here, '../src/data/openings.json'), 'utf8'));
const epd = (fen) => fen.split(' ').slice(0, 4).join(' ');
const openingFor = (fen) => OPENINGS[epd(fen)];
const family = (name) => name.split(': ')[0];
const scoreOf = (n) => (n.games ? (n.wins + 0.5 * n.draws) / n.games : 0);

async function importLichess(user, max = 80) {
  const url = `https://lichess.org/api/games/user/${user}?max=${max}&moves=true&pgnInJson=false&opening=false&rated=true`;
  const res = await fetch(url, { headers: { Accept: 'application/x-ndjson' } });
  const text = await res.text();
  const games = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const g = JSON.parse(line);
    if (g.variant && g.variant !== 'standard') continue;
    if (!g.moves) continue;
    const white = g.players?.white?.user?.name?.toLowerCase() ?? '';
    const userColor = white === user.toLowerCase() ? 'white' : 'black';
    const result = !g.winner ? 'draw' : g.winner === userColor ? 'win' : 'loss';
    games.push({ moves: g.moves.split(' '), userColor, result });
  }
  return games;
}

function buildTree(games, color, maxPly = 24) {
  const root = { move: '', line: [], ply: 0, turn: 'white', games: 0, wins: 0, losses: 0, draws: 0, children: {}, namePath: undefined };
  const add = (n, r) => { n.games++; n[r === 'win' ? 'wins' : r === 'loss' ? 'losses' : 'draws']++; };
  for (const g of games) {
    if (g.userColor !== color) continue;
    add(root, g.result);
    const c = new Chess();
    let node = root;
    for (let i = 0; i < Math.min(g.moves.length, maxPly); i++) {
      try { if (!c.move(g.moves[i])) break; } catch { break; }
      const san = g.moves[i];
      if (!node.children[san]) {
        const fen = c.fen();
        const op = openingFor(fen);
        node.children[san] = {
          move: san, line: [...node.line, san], ply: i + 1,
          turn: fen.split(' ')[1] === 'w' ? 'white' : 'black',
          opening: op, namePath: op ?? node.namePath,
          games: 0, wins: 0, losses: 0, draws: 0, children: {},
        };
      }
      node = node.children[san];
      add(node, g.result);
    }
  }
  return root;
}

const sortedKids = (n) => Object.values(n.children).sort((a, b) => b.games - a.games);

function summarize(games, color) {
  const fam = new Map();
  for (const g of games) {
    if (g.userColor !== color) continue;
    const c = new Chess();
    let deepest;
    for (let i = 0; i < Math.min(g.moves.length, 24); i++) {
      try { if (!c.move(g.moves[i])) break; } catch { break; }
      const op = openingFor(c.fen());
      if (op) deepest = op;
    }
    if (!deepest) continue;
    const f = family(deepest.name);
    const a = fam.get(f) ?? { f, games: 0, wins: 0, draws: 0, losses: 0 };
    a.games++; a[g.result === 'win' ? 'wins' : g.result === 'loss' ? 'losses' : 'draws']++;
    fam.set(f, a);
  }
  return [...fam.values()].sort((a, b) => b.games - a.games);
}

function weaknesses(root, color) {
  const minGames = Math.max(3, Math.round(root.games * 0.04));
  const baseline = scoreOf(root);
  const out = [];
  const visit = (n) => {
    if (n.turn === color && n.ply >= 1 && n.games >= minGames) {
      const main = sortedKids(n)[0];
      if (main && main.games >= minGames && scoreOf(main) <= Math.min(0.47, baseline - 0.03)) {
        out.push({ line: n.line.join(' '), move: main.move, score: scoreOf(main), games: main.games });
      }
    }
    for (const c of Object.values(n.children)) visit(c);
  };
  visit(root);
  return out.sort((a, b) => a.score - b.score).slice(0, 5);
}

const user = process.argv[2] || 'DrNykterstein';
console.log(`Importing lichess/${user}…`);
const games = await importLichess(user);
console.log(`  ${games.length} games (${games.filter(g => g.userColor === 'white').length}W / ${games.filter(g => g.userColor === 'black').length}B)`);
for (const color of ['white', 'black']) {
  const tree = buildTree(games, color);
  if (!tree.games) continue;
  console.log(`\n== As ${color}: ${tree.games} games, score ${(scoreOf(tree) * 100).toFixed(0)}% ==`);
  console.log('  Top openings:');
  for (const o of summarize(games, color).slice(0, 4))
    console.log(`    ${o.f.padEnd(28)} ${o.games}g  ${(scoreOf(o) * 100).toFixed(0)}%`);
  const w = weaknesses(tree, color);
  if (w.length) {
    console.log('  Weak spots:');
    for (const x of w) console.log(`    after "${x.line}" you play ${x.move}: ${(x.score * 100).toFixed(0)}% over ${x.games}g`);
  }
}
