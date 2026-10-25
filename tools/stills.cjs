// Renders single frames to PNG for review: node tools/stills.cjs 1.5 7 12 ...  (times in seconds)
// Needs a local static server on the repository root, see README (default http://127.0.0.1:8123).
const { chromium } = require('playwright');
const path = require('path');
const BASE = process.env.BASE || 'http://127.0.0.1:8123';
(async () => {
  const times = process.argv.slice(2).map(Number);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console:', m.text()); });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.goto(`${BASE}/animation/index.html?render=1`);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 });
  const subs = process.env.SUBS !== '0';
  await page.evaluate((s) => window.setSubs(s), subs);
  for (const t of times) {
    await page.evaluate((tt) => window.renderFrame(tt), t);
    const file = path.join(__dirname, '..', 'build', 'stills', `t${t.toFixed(2).padStart(6, '0')}.png`);
    await page.locator('#c').screenshot({ path: file });
    console.log('wrote', file);
  }
  await browser.close();
})();
