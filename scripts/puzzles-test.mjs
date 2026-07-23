import { chromium } from 'playwright';

const OUT = process.env.SHOT_DIR || '.';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const errors = [];
ctx.on('page', (pg) => pg.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message)));

// A crafted lost game with one clear blunder: Black walks into Scholar's mate.
// Black's ...Nf6 (allowing Qxf7#) is the worst eval drop; anything defending
// f7 (…g6 / …Qe7 / …Qf6) is the solution.
const game = {
  id: 'lichess:blunder1',
  site: 'lichess',
  moves: ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#'],
  userColor: 'black',
  result: 'loss',
  date: '2026-06-01T00:00:00.000Z',
  opponent: 'scholar',
  url: 'https://lichess.org/blunder1',
  timeClass: 'blitz',
  whiteRating: 1500,
  blackRating: 1500,
};

// 1) Seed it into the yourlines suite cache (same-origin IndexedDB).
const lines = await ctx.newPage();
await lines.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await lines.evaluate(
  () =>
    new Promise((res) => {
      localStorage.clear();
      const req = indexedDB.deleteDatabase('yourlines');
      req.onsuccess = req.onerror = req.onblocked = () => res();
    }),
);
await lines.reload({ waitUntil: 'networkidle' });
await lines.waitForTimeout(800); // let hydrate create the stores
await lines.evaluate(async (g) => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('yourlines');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const put = (store, val, k) =>
    new Promise((res, rej) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(val, k);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  const key = 'lichess:scholar';
  await put('games', [g], key);
  await put('meta', { key, site: 'lichess', username: 'scholar', gameCount: 1, savedAt: Date.now(), newestAt: Date.now(), updatedAt: Date.now() }, key);
  await put('settings', key, 'lastActive');
}, game);
console.log('1) seeded crafted blunder game into the suite cache');

// 2) Open Puzzles (suite source should be detected from the cache).
const pz = await ctx.newPage();
await pz.goto('http://localhost:5173/puzzles/?depth=10&maxgames=2', { waitUntil: 'load' });
await pz.waitForTimeout(1000);
const source = (await pz.locator('#source').innerText()).replace(/\s+/g, ' ').trim();
console.log('2) source:', source);
const pillActive = await pz
  .locator('#yl-suite-nav a', { hasText: 'Puzzles' })
  .evaluate((el) => el.style.fontWeight === '600')
  .catch(() => false);
console.log('   suite pill "Puzzles" active:', pillActive);

// 3) Build.
await pz.getByRole('button', { name: 'Build my puzzles' }).click();
await pz.getByRole('button', { name: /Start solving/ }).waitFor({ timeout: 120000 });
console.log('3) build done:', (await pz.locator('#progText').innerText()).trim());

// 4) Start solving; inspect the generated puzzle.
await pz.getByRole('button', { name: /Start solving/ }).click();
await pz.waitForTimeout(600);
const puz = await pz.evaluate(() => {
  const p = window.__ycp.current();
  return p && { playedSan: p.playedSan, bestUci: p.bestUci, fen: p.fen, userColor: p.userColor, loss: Math.round(p.loss) };
});
console.log('4) puzzle:', JSON.stringify(puz));
await pz.screenshot({ path: `${OUT}/pz1-puzzle.png` });

// 5) Wrong move: play the blunder itself -> expect a "drops" message.
await pz.evaluate(() => window.__ycp.move('g8', 'f6')); // Nf6, the blunder
await pz.waitForTimeout(2500);
const wrong = (await pz.locator('#status').innerText()).trim();
console.log('5) after playing the blunder Nf6:', JSON.stringify(wrong));

// 6) Correct move: play the engine's best -> expect "Solved!".
await pz.waitForTimeout(400);
const best = puz.bestUci;
await pz.evaluate((b) => window.__ycp.move(b.slice(0, 2), b.slice(2, 4)), best);
await pz.waitForTimeout(3000);
const solved = await pz.evaluate(() => ({
  status: document.getElementById('status').innerText,
  solutionShown: !document.getElementById('solution').classList.contains('hide'),
  solText: document.getElementById('solText').innerText.replace(/\s+/g, ' ').trim().slice(0, 140),
  playHref: document.getElementById('playLink').getAttribute('href'),
  playTarget: document.getElementById('playLink').getAttribute('target'),
  gameHref: document.getElementById('gameLink').getAttribute('href'),
  solvedCount: document.getElementById('solvedCount').textContent,
}));
console.log('6) after playing best move ' + best + ':', JSON.stringify(solved));
await pz.screenshot({ path: `${OUT}/pz2-solved.png` });

console.log('page errors:', errors.length ? errors.slice(0, 4).join(' | ') : 'none');
await browser.close();
