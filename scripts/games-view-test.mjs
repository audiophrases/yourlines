import { chromium } from 'playwright';

const OUT = process.env.SHOT_DIR;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

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
await page.waitForTimeout(600);

// 1) Games tab at start: all games as white.
await page.getByRole('button', { name: /^Games/ }).click();
await page.waitForTimeout(400);
let head = (await page.locator('main p').first().innerText()).replace(/\n/g, ' ');
console.log(`1) Games tab (start): "${head.trim().slice(0, 70)}"`);

// 2) Navigate into 1.e4 via the tree; count should narrow.
await page.getByRole('button', { name: 'Lines tree' }).click();
await page.locator('button:has-text("1. e4")').first().click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: /^Games/ }).click();
await page.waitForTimeout(400);
head = (await page.locator('main p').first().innerText()).replace(/\n/g, ' ');
const rows = await page.locator('main .group.flex.items-center').count();
console.log(`2) after 1.e4: "${head.trim().slice(0, 80)}" · rows=${rows}`);
await page.screenshot({ path: `${OUT}/gv1-games.png` });

// 3) View: load a game onto the board; breadcrumb grows, label says beyond lines.
await page.getByRole('button', { name: 'View', exact: true }).first().click();
await page.waitForTimeout(500);
const crumbs = await page.locator('button.font-mono').count();
const beyond = (await page.getByText(/Beyond your common lines/).count()) > 0;
console.log(`3) View game: breadcrumb moves=${crumbs}, off-tree label=${beyond}`);
await page.screenshot({ path: `${OUT}/gv2-viewgame.png` });

// 4) Weak spots -> Games action.
await page.getByRole('button', { name: /Weak spots/ }).click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Games', exact: true }).first().click();
await page.waitForTimeout(400);
head = (await page.locator('main p').first().innerText()).replace(/\n/g, ' ');
console.log(`4) weak spot -> Games: "${head.trim().slice(0, 80)}"`);

// 5) Your openings -> "games →".
await page.getByRole('button', { name: 'Your openings' }).click();
await page.waitForTimeout(300);
const card = page.locator('div.group[role="button"]').first();
await card.hover();
await card.getByRole('button', { name: /games/ }).click();
await page.waitForTimeout(400);
head = (await page.locator('main p').first().innerText()).replace(/\n/g, ' ');
console.log(`5) opening -> games: "${head.trim().slice(0, 80)}"`);

// 6) Row actions sanity: Review handoff navigates to /review/ prefilled.
await page.getByRole('button', { name: 'Review', exact: true }).first().click();
await page.waitForURL('**/review/**', { timeout: 10000 });
await page.waitForTimeout(2500);
const pgnLen = (await page.locator('#pgn-input').inputValue()).length;
console.log(`6) row Review -> /review/ pgn filled: ${pgnLen > 50 ? 'yes' : 'NO'} (${pgnLen} chars)`);

console.log('page errors:', errors.length ? errors.slice(0, 4).join(' | ') : 'none');
await browser.close();
