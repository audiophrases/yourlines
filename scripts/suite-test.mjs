import { chromium } from 'playwright';

const OUT = process.env.SHOT_DIR;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errorsByApp = {};
let current = 'hub';
page.on('console', (m) => {
  if (m.type() === 'error') (errorsByApp[current] ??= []).push(m.text());
});
page.on('pageerror', (e) => (errorsByApp[current] ??= []).push('PAGEERROR: ' + e.message));

// Hub: header suite nav present.
current = 'hub';
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
const hubNav = await page.locator('nav a').allInnerTexts();
console.log('hub nav links:', hubNav.join(', '));
await page.screenshot({ path: `${OUT}/s1-hub.png` });

// Each sub-app: loads, suite pill present + active item correct, board visible.
for (const app of ['play', 'gym', 'review']) {
  current = app;
  await page.goto(`http://localhost:5173/${app}/`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const pill = page.locator('#yl-suite-nav');
  const pillOk = (await pill.count()) === 1;
  const activeTxt = pillOk
    ? await pill.locator('a').evaluateAll((as) => {
        const hit = as.find((a) => a.style.fontWeight === '600');
        return hit ? hit.textContent : '(none)';
      })
    : 'NO PILL';
  const boards = await page
    .locator('canvas, .board-b72b1, [class*=board], [id*=board], cg-board')
    .count();
  console.log(`/${app}/: pill=${pillOk ? 'yes' : 'NO'} active="${activeTxt}" board-els=${boards}`);
  await page.screenshot({ path: `${OUT}/s2-${app}.png` });
}

// Nav from a sub-app back to the hub.
current = 'navtest';
await page.goto('http://localhost:5173/play/', { waitUntil: 'load' });
await page.waitForTimeout(800);
await page.locator('#yl-suite-nav a', { hasText: 'Lines' }).click();
await page.waitForURL('http://localhost:5173/', { timeout: 5000 });
console.log('pill navigation play -> hub works');

for (const [app, errs] of Object.entries(errorsByApp)) {
  console.log(`console errors [${app}]: ${errs.length ? errs.slice(0, 3).join(' | ').slice(0, 300) : 'none'}`);
}
await browser.close();
