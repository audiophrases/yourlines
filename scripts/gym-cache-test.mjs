import { chromium } from 'playwright';

const OUT = process.env.SHOT_DIR;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

// Seed a profile in Lines.
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
console.log('profile imported (89 games)');

// Gym: open Lookup, fetch games — should come from cache with 0 API calls.
let apiCalls = 0;
page.on('request', (r) => {
  if (r.url().includes('lichess.org/api') || r.url().includes('api.chess.com')) apiCalls++;
});
await page.goto('http://localhost:5173/gym/', { waitUntil: 'load' });
await page.waitForTimeout(2000);
await page.locator('#lookupBtn').click();
await page.waitForTimeout(800); // bridge prefill
apiCalls = 0;
await page.locator('#lookupFetchGames').click();
await page.waitForTimeout(1500);
const status = (await page.locator('#lookupGamesStatus').innerText()).trim();
const rows = await page.locator('#lookupGamesList button').count();
console.log(`status: "${status}"`);
console.log(`rows=${rows}, API calls during fetch=${apiCalls} (expect 0)`);

// Click a game -> lookup runs against the line library.
await page.locator('#lookupGamesList button').first().click();
await page.waitForTimeout(1500);
const results = (await page.locator('#lookupResults').innerText()).trim().slice(0, 150);
console.log(`lookup results after selecting a cached game: "${results.replace(/\n/g, ' | ')}"`);
await page.screenshot({ path: `${OUT}/g1-gym-cache.png` });

console.log('page errors:', errors.length ? errors.slice(0, 4).join(' | ') : 'none');
await browser.close();
