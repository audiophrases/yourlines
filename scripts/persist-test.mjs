import { chromium } from 'playwright';

const OUT = process.env.SHOT_DIR;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

let lichessCalls = 0;
page.on('request', (r) => {
  if (r.url().includes('lichess.org/api')) lichessCalls++;
});

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());

// First import.
await page.getByRole('button', { name: 'Lichess', exact: true }).click();
await page.getByPlaceholder('lichess username').fill('german11');
await page.getByRole('button', { name: 'Analyze' }).click();
await page.getByRole('button', { name: /As White/ }).waitFor({ timeout: 40000 });
await page.waitForTimeout(800);

const savedRaw = await page.evaluate(() => localStorage.getItem('yourlines:v1'));
const saved = JSON.parse(savedRaw);
console.log(`saved to localStorage: ${saved.games.length} games, user=${saved.username}, ~${Math.round(savedRaw.length / 1024)}KB`);
console.log(`lichess API calls during first import: ${lichessCalls}`);

// Reload — should restore from cache with NO new network calls.
lichessCalls = 0;
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: /As White/ }).waitFor({ timeout: 10000 });
await page.getByText('Saved on this device').waitFor({ timeout: 5000 });
await page.waitForTimeout(500);
console.log(`lichess API calls after reload: ${lichessCalls} (expect 0 — restored from cache)`);
await page.screenshot({ path: `${OUT}/5-restored.png` });

// Clear should reset to the landing screen and wipe storage.
await page.getByRole('button', { name: 'Clear' }).click();
await page.getByText('Study').waitFor({ timeout: 5000 });
const afterClear = await page.evaluate(() => localStorage.getItem('yourlines:v1'));
console.log(`after Clear: storage=${afterClear === null ? 'empty ✓' : 'STILL SET ✗'}, landing shown ✓`);

await browser.close();
