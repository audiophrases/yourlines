import { chromium } from 'playwright';

const OUT = process.env.SHOT_DIR;
const USER = 'neio'; // small Lichess account (~223 games) so "all" is fast
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

let lichessCalls = 0;
page.on('request', (r) => {
  if (r.url().includes('lichess.org/api')) lichessCalls++;
});

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
// Clean slate: wipe both IndexedDB and any legacy localStorage.
await page.evaluate(async () => {
  localStorage.clear();
  await new Promise((res) => {
    const req = indexedDB.deleteDatabase('yourlines');
    req.onsuccess = req.onerror = req.onblocked = () => res();
  });
});
await page.reload({ waitUntil: 'networkidle' });

// Full "all" import.
await page.getByRole('button', { name: 'Lichess', exact: true }).click();
await page.getByPlaceholder(/username/).fill(USER);
lichessCalls = 0;
await page.getByRole('button', { name: 'Analyze' }).click();
await page.getByRole('button', { name: /As White/ }).waitFor({ timeout: 60000 });
await page.waitForTimeout(1500);

const imported = await page.evaluate(() => {
  return new Promise((resolve) => {
    const req = indexedDB.open('yourlines');
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('kv', 'readonly');
      const g = tx.objectStore('kv').get('current');
      g.onsuccess = () =>
        resolve({
          games: g.result?.games?.length ?? 0,
          newestAt: g.result?.newestAt ?? null,
          hasLegacyLS: localStorage.getItem('yourlines:v1') !== null,
        });
      g.onerror = () => resolve(null);
    };
    req.onerror = () => resolve(null);
  });
});
console.log(`imported: ${imported.games} games -> stored in IndexedDB`);
console.log(`localStorage used for games? ${imported.hasLegacyLS ? 'YES ✗' : 'no ✓ (IndexedDB only)'}`);
console.log(`lichess calls during full import: ${lichessCalls}`);
await page.screenshot({ path: `${OUT}/7-all-import.png` });

// Reload — restore from IndexedDB with no network.
lichessCalls = 0;
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: /As White/ }).waitFor({ timeout: 15000 });
await page.getByText(/games ·/).waitFor({ timeout: 5000 });
await page.waitForTimeout(500);
console.log(`lichess calls after reload: ${lichessCalls} (expect 0 — restored from IndexedDB)`);

// Incremental refresh — fetch only games newer than the cursor.
lichessCalls = 0;
await page.getByRole('button', { name: 'Refresh' }).click();
await page.getByText(/up to date|\+\d+ new/).waitFor({ timeout: 30000 });
const note = await page.getByText(/up to date|\+\d+ new/).first().innerText();
console.log(`refresh made ${lichessCalls} lichess call(s); result note: "${note.trim()}"`);
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/8-refresh.png` });

await browser.close();
