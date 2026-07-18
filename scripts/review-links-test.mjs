import { chromium } from 'playwright';

const OUT = process.env.SHOT_DIR;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

// Seed profile in Lines.
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
console.log('profile seeded');

// Reviewer: pick a short decisive game via the bridge picker, then start the
// analysis. (The analyze click is dispatched via the handler: the picker's
// smooth scrollIntoView never settles under headless rAF throttling, so real
// pointer clicks land on stale coordinates — a headless-only artifact.)
await page.goto('http://localhost:5173/review/', { waitUntil: 'load' });
await page.waitForTimeout(2500);
await page.locator('#yl-bridge-chip').click();
await page.locator('#yl-bridge-list button', { hasText: 'jimbaran' }).first().click();
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const jq = window.jQuery;
  const ev = jq._data(document.getElementById('analyze-pgn-btn'), 'events');
  ev.click[0].handler.call(document.getElementById('analyze-pgn-btn'), jq.Event('click'));
});
console.log('analysis started (8-ply game)…');

await page.locator('#review-section:visible').waitFor({ timeout: 180000 });
await page.waitForTimeout(2000);
const moveRows = await page.locator('.move-item').count();
const linkGroups = await page.locator('.suite-move-links').count();
const firstLinks = linkGroups
  ? await page
      .locator('.suite-move-links')
      .first()
      .evaluate((el) =>
        [...el.querySelectorAll('a')]
          .map((a) => a.textContent + '->' + decodeURIComponent(a.getAttribute('href')).slice(0, 28))
          .join(' | '),
      )
  : '(none)';
console.log(`review screen: ${moveRows} move rows, ${linkGroups} notable with suite links`);
console.log(`first link group: ${firstLinks}`);
await page.screenshot({ path: `${OUT}/r1-review-links.png` });

// Follow the first "Lines" link -> position search in Lines.
if (linkGroups) {
  const href = await page
    .locator('.suite-move-links a', { hasText: 'Lines' })
    .first()
    .getAttribute('href');
  await page.goto('http://localhost:5173' + href, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const crumbs = (await page.locator('button.font-mono').allInnerTexts()).join(' ');
  const tab = await page
    .locator('div.border-b button.bg-ink-800')
    .first()
    .innerText()
    .then((t) => t.split('\n')[0])
    .catch(() => '?');
  console.log(
    `followed Lines link -> crumbs="${crumbs.replace(/\s+/g, ' ').trim()}" tab="${tab}"`,
  );
  await page.screenshot({ path: `${OUT}/r2-lines-from-review.png` });
}

console.log('page errors:', errors.length ? errors.slice(0, 4).join(' | ') : 'none');
await browser.close();
