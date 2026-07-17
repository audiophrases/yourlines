import { chromium } from 'playwright';

const OUT = process.env.SHOT_DIR;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

// 1) Import a profile in Lines.
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
console.log('1. profile imported in Lines');

// 2) Reviewer picker: "From Lines" -> pick a game -> PGN filled.
await page.goto('http://localhost:5173/review/', { waitUntil: 'load' });
await page.waitForTimeout(1500);
const fromLines = page.locator('#yl-bridge-chip');
console.log('2. "Your games" chip present:', (await fromLines.count()) === 1 ? 'yes' : 'NO');
await fromLines.click();
await page.locator('#yl-bridge-panel').waitFor({ timeout: 5000 });
const firstGame = page.locator('#yl-bridge-list button').first();
await firstGame.waitFor({ timeout: 5000 });
const rows = await page.locator('#yl-bridge-list button').count();
await page.screenshot({ path: `${OUT}/b1-picker.png` });
await firstGame.click();
await page.waitForTimeout(400);
const pgn = await page.locator('#pgn-input').inputValue();
const player = await page.locator('#player-name-input').inputValue();
console.log(`   picker rows=${rows}; after click: player="${player}" pgn-head="${pgn.slice(0, 60).replace(/\n/g, ' ')}..."`);

// 3) Weak-spot handoff: Lines -> Review button -> auto-filled Reviewer.
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /Weak spots/ }).click();
const reviewBtn = page.getByRole('button', { name: 'Review', exact: true }).first();
await reviewBtn.waitFor({ timeout: 5000 });
await reviewBtn.click();
await page.waitForURL('**/review/**', { timeout: 10000 });
await page.waitForTimeout(2500);
const pgn2 = await page.locator('#pgn-input').inputValue();
console.log(`3. handoff: landed on /review/, pgn filled=${pgn2.length > 50 ? 'yes' : 'NO'} (${pgn2.length} chars)`);
await page.screenshot({ path: `${OUT}/b2-handoff.png` });

// 4) Gym prefill: Lookup opens with username prefilled.
await page.goto('http://localhost:5173/gym/', { waitUntil: 'load' });
await page.waitForTimeout(2000);
await page.locator('#lookupBtn').click();
await page.waitForTimeout(700);
const lookupUser = await page.locator('#lookupUsername').inputValue();
const lookupSite = await page.locator('#lookupSite').inputValue();
console.log(`4. gym lookup prefill: username="${lookupUser}" site="${lookupSite}"`);
await page.screenshot({ path: `${OUT}/b3-gym.png` });

console.log('page errors:', errors.length ? errors.slice(0, 4).join(' | ') : 'none');
await browser.close();
