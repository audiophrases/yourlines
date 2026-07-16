import { chromium } from 'playwright';

const OUT = process.env.SHOT_DIR;
const A = 'neio'; // ~89 rated games
const B = 'rebeca'; // a bit larger, still quick
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

let lichessCalls = 0;
page.on('request', (r) => r.url().includes('lichess.org/api') && lichessCalls++);

const metaCount = () =>
  page.evaluate(
    () =>
      new Promise((res) => {
        const req = indexedDB.open('yourlines');
        req.onsuccess = () => {
          const tx = req.result.transaction('meta', 'readonly');
          const r = tx.objectStore('meta').getAllKeys();
          r.onsuccess = () => res(r.result.length);
          r.onerror = () => res(-1);
        };
        req.onerror = () => res(-1);
      }),
  );
const activeLabel = async () =>
  (await page.locator('button', { hasText: /\/(neio|rebeca)/ }).first().innerText()).replace(/\s+/g, ' ').trim();

const importUser = async (u) => {
  await page.getByPlaceholder(/username/).first().fill(u);
  await page.getByRole('button', { name: 'Analyze' }).click();
  await page.waitForFunction(
    (name) => document.body.innerText.includes(`/${name}`),
    u,
    { timeout: 60000 },
  );
  await page.waitForTimeout(1200);
};

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

// Import two accounts.
await page.getByRole('button', { name: 'Lichess', exact: true }).click();
await importUser(A);
console.log(`after import A: profiles=${await metaCount()}, active="${await activeLabel()}"`);
await importUser(B);
console.log(`after import B: profiles=${await metaCount()}, active="${await activeLabel()}"`);

// Switch back to A — should be instant with no network.
lichessCalls = 0;
await page.getByRole('button', { name: /rebeca/ }).first().click(); // open dropdown (active=rebeca)
await page.getByRole('button', { name: /\/neio\s+\d+/ }).click(); // pick neio row
await page.waitForTimeout(600);
console.log(`after switch to A: active="${await activeLabel()}", lichess calls during switch=${lichessCalls} (expect 0)`);
await page.screenshot({ path: `${OUT}/9-profiles.png` });

// Export a backup.
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.getByRole('button', { name: 'Export' }).click(),
]);
const backupPath = await download.path();
const backupText = await (await import('node:fs/promises')).readFile(backupPath, 'utf8');
const backup = JSON.parse(backupText);
console.log(`exported backup: ${backup.profiles.length} profiles, app=${backup.app}`);

// Remove the active account (neio) → 1 profile left.
await page.getByRole('button', { name: 'Remove' }).click();
await page.waitForTimeout(600);
console.log(`after remove A: profiles=${await metaCount()}, active="${await activeLabel()}"`);

// Re-import the backup file → back to 2 profiles.
await page.setInputFiles('input[type=file]', backupPath);
await page.waitForTimeout(1200);
console.log(`after import backup: profiles=${await metaCount()}`);

console.log('CONSOLE ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 5)) : 'none');
await browser.close();
