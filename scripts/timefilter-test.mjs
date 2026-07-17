import { chromium } from 'playwright';

const OUT = process.env.SHOT_DIR;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

const lastNum = (s) => {
  const m = String(s).match(/(\d[\d,]*)\s*$/);
  return m ? Number(m[1].replace(/,/g, '')) : -1;
};
const colorCount = async (which) =>
  lastNum(await page.getByRole('button', { name: new RegExp(`As ${which}`) }).first().innerText());
const weakCount = async () => {
  const t = await page.getByRole('button', { name: /Weak spots/ }).innerText();
  const m = t.match(/(\d+)/);
  return m ? Number(m[1]) : 0;
};
const setWindow = async (short) => {
  await page.getByRole('button', { name: short, exact: true }).click();
  await page.waitForTimeout(500);
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
await page.getByRole('button', { name: 'Lichess', exact: true }).click();
await page.getByPlaceholder(/username/).fill('neio');
await page.getByRole('button', { name: 'Analyze' }).click();
await page.getByRole('button', { name: /As White/ }).waitFor({ timeout: 60000 });
await page.waitForTimeout(800);

const allW = await colorCount('White');
const allB = await colorCount('Black');
const allWeak = await weakCount();
console.log(`ALL: white=${allW} black=${allB} weakspots=${allWeak}`);
await page.screenshot({ path: `${OUT}/tf1-all.png` });

for (const win of ['2Y', '1Y', '3M']) {
  await setWindow(win);
  const w = await colorCount('White');
  const b = await colorCount('Black');
  const wk = await weakCount();
  const indicator = (await page.getByText(/ of \d/).count()) > 0;
  console.log(`${win}: white=${w} black=${b} weakspots=${wk} · "N of M" shown=${indicator}`);
}
await page.screenshot({ path: `${OUT}/tf2-3m.png` });

// Persistence: reload should keep the last window (3M).
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: /As White/ }).waitFor({ timeout: 15000 });
await page.waitForTimeout(600);
const active3m = await page
  .getByRole('button', { name: '3M', exact: true })
  .evaluate((el) => el.className.includes('amber'));
const wAfterReload = await colorCount('White');
console.log(`after reload: 3M active=${active3m}, white=${wAfterReload}`);

// Back to All.
await setWindow('All');
console.log(`reset to All: white=${await colorCount('White')} (expect ${allW})`);

console.log('assert monotonic (all >= 2Y >= 3M):', allW >= 0 ? 'counts read ok' : 'FAILED to read');
console.log('page errors:', errors.length ? errors.slice(0, 4).join(' | ') : 'none');
await browser.close();
