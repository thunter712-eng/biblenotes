// Rasterises public/icons/icon.svg into the PNG icons and iPad splash screens using Playwright's Chromium.
// Run with: npm run build:icons (the output is committed, so this only needs re-running if the icon changes).
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const svg = readFileSync('public/icons/icon.svg', 'utf8');
const browser = await chromium.launch();

async function render(path: string, w: number, h: number, html: string) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(`<!doctype html><body style="margin:0;width:${w}px;height:${h}px;overflow:hidden">${html}</body>`);
  await page.screenshot({ path });
  await page.close();
}

const icon = (size: number) => `<div style="width:${size}px;height:${size}px">${svg}</div>`;
await render('public/icons/icon-192.png', 192, 192, icon(192));
await render('public/icons/icon-512.png', 512, 512, icon(512));
await render('public/icons/apple-touch-icon.png', 180, 180, icon(180));
// Maskable: shrink the artwork into the 80% safe zone on matching lapis.
await render('public/icons/icon-maskable-512.png', 512, 512,
  `<div style="width:512px;height:512px;background:#233F8C;display:grid;place-items:center"><div style="width:410px;height:410px">${svg}</div></div>`);

for (const [w, h] of [[2048, 2732], [1668, 2388], [1640, 2360], [1536, 2048]]) {
  for (const [sw, sh] of [[w, h], [h, w]]) {
    const size = Math.round(Math.min(sw, sh) * 0.22);
    await render(`public/splash/${sw}x${sh}.png`, sw, sh,
      `<div style="width:100%;height:100%;background:#FAFAF7;display:grid;place-items:center"><div style="width:${size}px;height:${size}px;border-radius:${size * 0.22}px;overflow:hidden">${svg}</div></div>`);
  }
}
await browser.close();
