// Renders every frame of the animation to PNG, each at its exact time, with headless Chromium.
//
//   node tools/render.cjs [--subs] [--fps 60] [--workers 4]
//
// Writes build/frames/<clean|subs>/000000.png ... plus build/sfx.json (sound cues taken from
// the same timeline) and build/drawn-text.json (every string drawn on screen, for tools/check.py).
// Needs a static server on the repository root (BASE, default http://127.0.0.1:8123).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BASE = process.env.BASE || 'http://127.0.0.1:8123';
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const SUBS = args.includes('--subs');
const FPS = Number(opt('fps', 60));
const WORKERS = Number(opt('workers', 4));
const OUT = path.join(ROOT, 'build', 'frames', SUBS ? 'subs' : 'clean');

async function openPage(browser) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', (e) => { console.error('pageerror', e.message); process.exitCode = 1; });
  await page.goto(`${BASE}/animation/index.html?render=1`);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 60000 });
  await page.evaluate((s) => window.setSubs(s), SUBS);
  return page;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const pages = await Promise.all(Array.from({ length: WORKERS }, () => openPage(browser)));
  const duration = await pages[0].evaluate(() => window.duration);
  const total = Math.round(duration * FPS);
  console.log(`${SUBS ? 'subs' : 'clean'}: ${total} frames at ${FPS} fps (${duration}s), ${WORKERS} workers`);

  let next = 0;
  let done = 0;
  const started = Date.now();
  async function work(page) {
    for (;;) {
      const i = next++;
      if (i >= total) return;
      const t = i / FPS;
      const data = await page.evaluate((tt) => {
        window.renderFrame(tt);
        return document.getElementById('c').toDataURL('image/png');
      }, t);
      fs.writeFileSync(path.join(OUT, `${String(i).padStart(6, '0')}.png`), Buffer.from(data.split(',')[1], 'base64'));
      done++;
      if (done % 300 === 0) {
        const rate = done / ((Date.now() - started) / 1000);
        console.log(`  ${done}/${total}  ${rate.toFixed(1)} fps  eta ${((total - done) / rate).toFixed(0)}s`);
      }
    }
  }
  await Promise.all(pages.map(work));

  const sfx = await pages[0].evaluate(() => window.sfxCues());
  fs.writeFileSync(path.join(ROOT, 'build', 'sfx.json'), JSON.stringify({ fps: FPS, duration, cues: sfx }, null, 1));
  if (!SUBS) {
    const drawn = new Set();
    for (const p of pages) for (const s of await p.evaluate(() => window.drawnText())) drawn.add(s);
    fs.writeFileSync(path.join(ROOT, 'build', 'drawn-text.json'), JSON.stringify([...drawn].sort(), null, 1));
  }
  await browser.close();
  console.log(`done in ${((Date.now() - started) / 1000).toFixed(0)}s`);
})();
