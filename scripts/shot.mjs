import { chromium } from 'playwright';

const OUT = process.env.SHOT_DIR;
const USER = process.env.SHOT_USER || 'german11';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Lichess', exact: true }).click();
await page.getByPlaceholder('lichess username').fill(USER);
await page.getByRole('button', { name: 'Analyze' }).click();
await page.getByRole('button', { name: /As White/ }).waitFor({ timeout: 40000 });
await page.waitForTimeout(1000);

// Focus the White repertoire and expand a couple of tree lines.
await page.getByRole('button', { name: /As White/ }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/2-workspace.png` });
console.log('workspace shot done');

// Weak spots.
await page.getByRole('button', { name: /Weak spots/ }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/3-weakspots.png` });
console.log('weakspots shot done');

// Analyse the top weakness with Stockfish.
await page.getByRole('button', { name: 'Analyse' }).first().click();
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/4-engine.png` });
console.log('engine shot done');

console.log('CONSOLE ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 10), null, 2) : 'none');
await browser.close();
