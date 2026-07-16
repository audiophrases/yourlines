import { chromium } from 'playwright';

const OUT = process.env.SHOT_DIR;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

// The alpha debug badge should be present.
const badge = page.getByRole('button', { name: /alpha/ });
await badge.waitFor({ timeout: 5000 });
console.log('debug badge visible ✓');

// 1) Trigger an uncaught error — the global handler should capture it.
await page.evaluate(() => {
  setTimeout(() => {
    // @ts-ignore
    const boom = null;
    boom.explode();
  }, 0);
});
await page.waitForTimeout(400);

// 2) Trigger an import failure (bad username) — should log a [import] error.
await page.getByPlaceholder(/username/).fill('zzz_nonexistent_user_9f8a7');
await page.getByRole('button', { name: 'Analyze' }).click();
await page.waitForTimeout(2500);

// Inspect persisted logs.
const logsRaw = await page.evaluate(() => localStorage.getItem('yourlines:logs'));
const logs = JSON.parse(logsRaw || '[]');
const errs = logs.filter((l) => l.level === 'error');
console.log(`persisted log entries: ${logs.length}, errors: ${errs.length}`);
console.log('tags seen:', [...new Set(logs.map((l) => l.tag))].join(', '));
console.log('has TypeError from window handler:', logs.some((l) => /explode|null/.test(l.msg + (l.detail || ''))) ? 'yes ✓' : 'NO ✗');
console.log('has [import] error:', errs.some((l) => l.tag === 'import') ? 'yes ✓' : 'NO ✗');

// Open the panel and screenshot.
await badge.click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/6-debug.png` });
console.log('debug panel screenshot done');

await browser.close();
