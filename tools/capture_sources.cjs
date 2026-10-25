// Saves a dated plain text snapshot of every page in content/sources.json.
// Output: evidence/<id>.txt plus evidence/manifest.json (URL, UTC capture time, SHA-256).
// Usage: node tools/capture_sources.cjs
const { chromium } = require('playwright');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const { sources } = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/sources.json'), 'utf8'));
const OUT = path.join(ROOT, 'evidence');

async function capture(browser, src) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(src.url, { waitUntil: 'networkidle', timeout: 90000 });
  // Scroll the whole page so lazily rendered sections are present in the text.
  for (let i = 0; i < 40; i++) {
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(1200);
  const title = await page.title();
  const raw = await page.evaluate(() => document.body.innerText);
  await page.close();
  // Normalise whitespace so the hash only changes when the words change.
  const text = raw.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n') + '\n';
  return { title, text };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const manifest = [];
  for (const src of sources) {
    const { title, text } = await capture(browser, src);
    const file = `${src.id}.txt`;
    const captured = new Date().toISOString();
    const header = `SOURCE: ${src.url}\nTITLE: ${title}\nCAPTURED (UTC): ${captured}\n\n`;
    fs.writeFileSync(path.join(OUT, file), header + text);
    manifest.push({
      id: src.id,
      url: src.url,
      title,
      file: `evidence/${file}`,
      captured_utc: captured,
      sha256: crypto.createHash('sha256').update(text).digest('hex'),
      characters: text.length,
    });
    console.log(`captured ${src.id} (${text.length} chars)`);
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ sources: manifest }, null, 2) + '\n');
})();
