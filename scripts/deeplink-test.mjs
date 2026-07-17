import { chromium } from 'playwright';

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

const crumbs = async () => {
  const t = await page.locator('button.font-mono').allInnerTexts();
  return t.map((x) => x.replace(/\s+/g, ' ').trim()).join(' ');
};
const activeTab = async () =>
  (await page.locator('div.border-b button.bg-ink-800').first().innerText()).split('\n')[0];

// 1) /?pgn= jumps to the line + Games tab.
await page.goto('http://localhost:5173/?pgn=' + encodeURIComponent('1. e4 c5 2. Nf3'), {
  waitUntil: 'networkidle',
});
await page.waitForTimeout(800);
console.log(`1) /?pgn=1.e4 c5 2.Nf3 -> crumbs="${await crumbs()}" tab="${await activeTab()}" url=${new URL(page.url()).search || '(cleaned)'}`);

// 2) /?fen= position search (after 1.e4 e5 — reached in neio's games).
const fenE4e5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2';
await page.goto('http://localhost:5173/?fen=' + encodeURIComponent(fenE4e5), {
  waitUntil: 'networkidle',
});
await page.waitForTimeout(800);
console.log(`2) /?fen=(after 1.e4 e5) -> crumbs="${await crumbs()}" tab="${await activeTab()}"`);

// 3) /?fen= not in games -> notice.
const weirdFen = 'rnbqkbnr/pppppppp/8/8/7P/7R/PPPPPPP1/RNBQKBN1 b Qkq - 0 4';
await page.goto('http://localhost:5173/?fen=' + encodeURIComponent(weirdFen), {
  waitUntil: 'networkidle',
});
await page.waitForTimeout(800);
const notice = await page.locator('.text-amber span').first().innerText().catch(() => '(none)');
console.log(`3) unknown fen -> notice: "${notice}"`);

// 4) Cross-app: /play/ with a line -> pill "Lines" -> lands on the position here.
await page.goto('http://localhost:5173/play/?pgn=' + encodeURIComponent('1. e4 e5'), {
  waitUntil: 'load',
});
await page.waitForTimeout(2500);
await page.locator('#yl-suite-nav a', { hasText: 'Lines' }).click();
await page.waitForURL(/localhost:5173\/(\?|$)/, { timeout: 10000 });
await page.waitForTimeout(900);
console.log(`4) Play -> pill Lines: crumbs="${await crumbs()}" tab="${await activeTab()}"`);

// 5) Cross-app: /play/ -> pill "Gym" carries the position into lookup.
await page.goto('http://localhost:5173/play/?pgn=' + encodeURIComponent('1. e4 e5 2. f4 exf4'), {
  waitUntil: 'load',
});
await page.waitForTimeout(2500);
await page.locator('#yl-suite-nav a', { hasText: 'Gym' }).click();
await page.waitForURL('**/gym/?lookup=**', { timeout: 10000 });
await page.locator('#lookupModal').waitFor({ state: 'visible', timeout: 20000 });
await page.waitForTimeout(1000);
const results = (await page.locator('#lookupResults').innerText()).trim().slice(0, 90);
console.log(`5) Play -> pill Gym: lookup results: "${results.replace(/\n+/g, ' | ')}"`);

console.log('page errors:', errors.length ? errors.slice(0, 4).join(' | ') : 'none');
await browser.close();
