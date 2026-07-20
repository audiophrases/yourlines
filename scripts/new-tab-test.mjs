import { chromium } from 'playwright';

const OUT = process.env.SHOT_DIR || '.';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const errors = [];

// Seed a profile so all suite features have data to work with.
const seed = await context.newPage();
await seed.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await seed.evaluate(
  () =>
    new Promise((res) => {
      localStorage.clear();
      const req = indexedDB.deleteDatabase('yourlines');
      req.onsuccess = req.onerror = req.onblocked = () => res();
    }),
);
await seed.reload({ waitUntil: 'networkidle' });
await seed.getByRole('button', { name: 'Lichess', exact: true }).click();
await seed.getByPlaceholder(/username/).fill('neio');
await seed.getByRole('button', { name: 'Analyze' }).click();
await seed.getByRole('button', { name: /As White/ }).waitFor({ timeout: 60000 });
await seed.close();

// 1) Reviewer mid-"analysis" (simulate in-page state) -> click a per-move
//    suite link -> a NEW tab opens, and the Reviewer tab's own state (a
//    marker we inject) survives untouched.
const rev = await context.newPage();
rev.on('pageerror', (e) => errors.push('REV PAGEERROR: ' + e.message));
await rev.goto('http://localhost:5173/review/', { waitUntil: 'load' });
await rev.waitForTimeout(2000);
await rev.locator('#yl-bridge-chip').click();
await rev.locator('#yl-bridge-list button', { hasText: 'jimbaran' }).first().click();
await rev.waitForTimeout(1500);
await rev.evaluate(() => {
  const jq = window.jQuery;
  const ev = jq._data(document.getElementById('analyze-pgn-btn'), 'events');
  ev.click[0].handler.call(document.getElementById('analyze-pgn-btn'), jq.Event('click'));
});
await rev.locator('#review-section:visible').waitFor({ timeout: 180000 });
await rev.waitForTimeout(1500);
// A marker representing "in-progress analysis state" that must survive.
await rev.evaluate(() => {
  window.__ANALYSIS_MARKER__ = 'still-here-' + Date.now();
});
const marker = await rev.evaluate(() => window.__ANALYSIS_MARKER__);
console.log('1) Reviewer analysis loaded, marker set:', marker);

const [linesTab] = await Promise.all([
  context.waitForEvent('page'),
  rev.locator('.suite-move-links a', { hasText: 'Lines' }).first().click(),
]);
await linesTab.waitForTimeout(1200);
console.log('2) clicking per-move "Lines" link opened a NEW tab:', linesTab.url());

const revStillThere = await rev.evaluate(() => ({
  marker: window.__ANALYSIS_MARKER__,
  reviewVisible: document.getElementById('review-section')?.offsetParent !== null,
  moveRows: document.querySelectorAll('.move-item').length,
}));
console.log('3) original Reviewer tab after the click:', JSON.stringify(revStillThere), '(expect marker unchanged, review still visible)');

// 4) Clicking "Lines" again from Reviewer reuses the SAME Lines tab (no 2nd
//    tab spawned) — count pages before/after.
const pagesBefore = context.pages().length;
await rev.locator('.suite-move-links a', { hasText: 'Lines' }).first().click();
await rev.waitForTimeout(1000);
const pagesAfter = context.pages().length;
console.log(`4) second "Lines" click -> pages before=${pagesBefore} after=${pagesAfter} (expect equal: reused tab)`);

// 5) From the suite pill inside Lines' new tab, jump to Play -> new tab; Lines
//    tab and its state (path) remain.
await linesTab.bringToFront();
await linesTab.waitForTimeout(600);
const linesTabUrlBefore = linesTab.url();
const [playTab] = await Promise.all([
  context.waitForEvent('page'),
  linesTab.getByRole('link', { name: 'Play', exact: true }).click(),
]);
await playTab.waitForTimeout(2000);
console.log('5) Lines pill "Play" opened a NEW tab:', playTab.url().slice(0, 60));
console.log('   Lines tab URL unchanged:', linesTab.url() === linesTabUrlBefore);

console.log('total open tabs at end:', context.pages().length, '(lines, review, +lines-from-review-link, +play — reused where possible)');
console.log('errors:', errors.length ? errors.join(' | ') : 'none');
await browser.close();
