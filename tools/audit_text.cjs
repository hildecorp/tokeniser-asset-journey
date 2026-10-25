// Draws every 1/20 s of the animation (no screenshots) and records every string drawn on
// screen, so tools/check.py can compare on-screen text with the script document.
// Writes build/drawn-text.json. Needs the static server (BASE, default http://127.0.0.1:8123).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE || 'http://127.0.0.1:8123';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(`${BASE}/animation/index.html?render=1`);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 60000 });
  const drawn = await page.evaluate(() => {
    for (let t = 0; t <= window.duration; t += 0.05) window.renderFrame(t);
    return window.drawnText();
  });
  fs.mkdirSync(path.join(__dirname, '..', 'build'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', 'build', 'drawn-text.json'), JSON.stringify(drawn.sort(), null, 1));
  console.log(`${drawn.length} distinct strings drawn`);
  await browser.close();
})();
