// Dev helper: node e2e/_shot.mjs <out.png> <hash> [js-to-run-before-shot] [theme]
import { webkit } from '@playwright/test';
const [out, hash, js, theme] = process.argv.slice(2);
const b = await webkit.launch();
const p = await b.newPage({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1 });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
p.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
await p.goto(`http://localhost:4179/biblenotes/${hash}`);
await p.waitForTimeout(900);
if (theme) await p.evaluate((t) => document.documentElement.dataset.theme = t, theme);
if (js) { await p.evaluate(js); await p.waitForTimeout(500); }
await p.screenshot({ path: out });
await b.close();
