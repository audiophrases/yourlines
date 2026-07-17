import { chromium } from 'playwright';

const OUT = process.env.SHOT_DIR;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

/** Assert a piece image sits on a square of the Play board. */
const pieceOn = (square) =>
  page.evaluate((sq) => {
    const el = document.querySelector(`[data-square="${sq}"] img`);
    return el ? el.src.split('/').pop() : null;
  }, square);

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

// 1) LINES -> Play: walk into a line first (click top tree move twice).
await page.locator('button:has-text("1. e4")').first().click();
await page.waitForTimeout(400);
const crumb = await page.locator('.font-mono.text-xs >> text=e4').first().count();
await page.getByRole('link', { name: 'Play', exact: true }).click();
await page.waitForURL('**/play/?pgn=**', { timeout: 10000 });
await page.waitForTimeout(2500);
console.log(`1) Lines -> Play url: ${decodeURIComponent(new URL(page.url()).search)} | e4 piece: ${await pieceOn('e4')} (crumb ok=${crumb >= 0})`);
await page.screenshot({ path: `${OUT}/p1-lines-to-play.png` });

// 2) GYM -> Play: gym loads a default drill position, pill Play carries FEN.
await page.goto('http://localhost:5173/gym/', { waitUntil: 'load' });
await page.waitForTimeout(3000);
await page.locator('#yl-suite-nav a', { hasText: 'Play' }).click();
await page.waitForURL('**/play/**', { timeout: 10000 });
await page.waitForTimeout(2500);
const gymSearch = decodeURIComponent(new URL(page.url()).search);
console.log(`2) Gym -> Play url: ${gymSearch.slice(0, 80)}…`);

// 3) REVIEWER -> Play: load a game from Lines picker, then Play.
await page.goto('http://localhost:5173/review/', { waitUntil: 'load' });
await page.waitForTimeout(2000);
await page.locator('#yl-bridge-chip').click();
await page.locator('#yl-bridge-list button').first().waitFor({ timeout: 8000 });
await page.locator('#yl-bridge-list button').first().click();
await page.waitForTimeout(600);
await page.locator('#yl-suite-nav a', { hasText: 'Play' }).click();
await page.waitForURL('**/play/?pgn=**', { timeout: 10000 });
await page.waitForTimeout(2500);
const revSearch = decodeURIComponent(new URL(page.url()).search);
const summary = await page.evaluate(() => {
  const el = document.getElementById('player-summary-names');
  return el ? el.textContent.trim() : '(no summary)';
});
console.log(`3) Reviewer -> Play url head: ${revSearch.slice(0, 60)}… | players: ${summary}`);
await page.screenshot({ path: `${OUT}/p2-review-to-play.png` });

console.log('page errors:', errors.length ? errors.slice(0, 4).join(' | ') : 'none');
await browser.close();
