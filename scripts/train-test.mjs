import { chromium } from 'playwright';

const OUT = process.env.SHOT_DIR;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

// Seed a profile so weak spots exist.
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

// Weak spots -> Train.
await page.getByRole('button', { name: /Weak spots/ }).click();
const trainBtn = page.getByRole('button', { name: 'Train', exact: true }).first();
await trainBtn.waitFor({ timeout: 5000 });
await trainBtn.click();
await page.waitForURL('**/gym/?lookup=**', { timeout: 10000 });
console.log('navigated to:', decodeURIComponent(new URL(page.url()).search));

// Gym should open the Lookup modal with the line prefilled and matches run.
await page.locator('#lookupModal').waitFor({ state: 'visible', timeout: 20000 });
const input = await page.locator('#lookupInput').inputValue();
await page.waitForTimeout(1000);
const status = (await page.locator('#lookupStatus').innerText()).trim();
const results = (await page.locator('#lookupResults').innerText()).trim().slice(0, 160);
console.log(`lookup input: "${input}"`);
console.log(`status: "${status}"`);
console.log(`results: "${results.replace(/\n/g, ' | ')}"`);
await page.screenshot({ path: `${OUT}/t1-train.png` });

// If there is a "Load line" button, click it to land in training.
const loadBtn = page.locator("#lookupResults button[data-lookup-action='load']").first();
if (await loadBtn.count()) {
  await loadBtn.click();
  await page.waitForTimeout(1200);
  const modalHidden = !(await page.locator('#lookupModal').isVisible());
  console.log(`clicked "Load line" -> modal closed=${modalHidden}, training view active`);
  await page.screenshot({ path: `${OUT}/t2-training.png` });
} else {
  console.log('no matching trainer line for this weak spot (valid outcome)');
}

console.log('page errors:', errors.length ? errors.slice(0, 4).join(' | ') : 'none');
await browser.close();
