import { chromium } from 'playwright';

const OUT = process.env.SHOT_DIR || '.';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

// Seed profile.
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.evaluate(
  () =>
    new Promise((res) => {
      localStorage.clear();
      const req = indexedDB.deleteDatabase('yourlines');
      req.onsuccess = req.onerror = req.onblocked = () => res();
    }),
);
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Lichess', exact: true }).click();
await page.getByPlaceholder(/username/).fill('neio');
await page.getByRole('button', { name: 'Analyze' }).click();
await page.getByRole('button', { name: /As White/ }).waitFor({ timeout: 60000 });

// Synthetic archived review joined to a real cached game URL.
const info = await page.evaluate(
  () =>
    new Promise((res) => {
      const req = indexedDB.open('yourlines');
      req.onsuccess = () => {
        req.result.transaction('games', 'readonly').objectStore('games').getAll().onsuccess = (
          e2,
        ) => {
          const g = (e2.target.result[0] || []).find((x) => x.url && x.userColor === 'white');
          res(g ? { url: g.url, m0: g.moves[0], m1: g.moves[1] } : null);
        };
      };
    }),
);
await page.evaluate((u) => {
  const pgn = `[White "neio"]\n[Black "opp"]\n[Site "${u.url}"]\n[Result "1-0"]\n\n1. ${u.m0} ${u.m1} 1-0`;
  const finalAnalysis = `${u.m0} - {1} Good: solid.\n${u.m1} - {-1} Good: fine.\nSummary: White won.`;
  localStorage.setItem(
    'cmr.reviewArchive.v1',
    JSON.stringify([
      {
        id: 'dl-test-1',
        title: 'deep link test',
        version: 1,
        finalAnalysis,
        pgn,
        summary:
          'Summary: Brilliant = 0 | Great = 0 | Only = 0 | Mistakes = 1 | Blunders = 0 | Misclicks = 0',
        playerName: 'neio',
        headers: { Site: u.url },
        movesCount: 2,
        createdAt: Date.now() - 7200000,
        updatedAt: Date.now() - 7200000,
      },
    ]),
  );
}, info);

// 1) Lines badge is a link.
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: /As White/ }).waitFor({ timeout: 15000 });
await page.getByRole('button', { name: /^Games/ }).click();
await page.waitForTimeout(600);
const badgeHref = await page.locator('a:has-text("✓ reviewed")').first().getAttribute('href');
console.log('1) badge href:', badgeHref);

// 2) Following it re-opens the saved review.
await page.goto('http://localhost:5173' + badgeHref, { waitUntil: 'load' });
await page.waitForTimeout(4500);
const st = await page.evaluate(() => ({
  reviewVisible: document.getElementById('review-section')?.offsetParent !== null,
  moveRows: document.querySelectorAll('.move-item').length,
  player: document.getElementById('player-name-input')?.value,
}));
console.log('2) archive deep link ->', JSON.stringify(st));

// 3) Picker check mark links to the archive too.
await page.goto('http://localhost:5173/review/', { waitUntil: 'load' });
await page.waitForTimeout(2000);
await page.locator('#yl-bridge-chip').click();
await page.locator('#yl-bridge-list button').first().waitFor({ timeout: 8000 });
const check = await page.locator('#yl-bridge-list [data-archive-id]').count();
console.log('3) picker ✓ with archive link:', check, '(expect 1)');

// 4) Gym pill dodges the admin drawer.
await page.goto('http://localhost:5173/gym/', { waitUntil: 'load' });
await page.waitForTimeout(3500);
const pos = await page.evaluate(() => {
  const pill = document.getElementById('yl-suite-nav').getBoundingClientRect();
  const drawer = document.querySelector('.admin-panel');
  const dr = drawer ? drawer.getBoundingClientRect() : null;
  const toggle = document.getElementById('adminToggle');
  const tr = toggle ? toggle.getBoundingClientRect() : null;
  const overlaps = (a, b2) =>
    a && b2 && !(a.right < b2.left || a.left > b2.right || a.bottom < b2.top || a.top > b2.bottom);
  return {
    drawerPresent: !!dr,
    pillRight: Math.round(pill.right),
    drawerLeft: dr ? Math.round(dr.left) : null,
    overlapsDrawer: overlaps(pill, dr),
    overlapsToggle: overlaps(pill, tr),
  };
});
console.log('4) gym pill:', JSON.stringify(pos));
await page.screenshot({ path: `${OUT}/gym-pill-fixed.png` });

console.log('page errors:', errors.length ? errors.slice(0, 3).join(' | ') : 'none');
await browser.close();
