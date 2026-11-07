// Fetches each translation's USFM zip, converts it to per-book JSON, and writes public/bible.
// The output is committed, so the app never needs the network for Scripture.
// Run with: npm run build:bible
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { TRANSLATIONS } from './translations.config.ts';
import { parseUsfm } from './usfm.ts';

const CACHE = '.bible-cache';
const OUT = 'public/bible';
const SKIP = new Set(['FRT', 'BAK', 'GLO', 'INT', 'XXA', 'XXB', 'XXC', 'XXD', 'XXE', 'XXF', 'XXG', 'OTH', 'CNC', 'TDX', 'NDX']);

mkdirSync(CACHE, { recursive: true });
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const index = [];
for (const t of TRANSLATIONS) {
  const cached = join(CACHE, `${t.id}.zip`);
  if (!existsSync(cached)) {
    console.log(`Downloading ${t.url}`);
    const res = await fetch(t.url);
    if (!res.ok) throw new Error(`${t.url}: HTTP ${res.status}`);
    writeFileSync(cached, new Uint8Array(await res.arrayBuffer()));
  }
  const files = unzipSync(new Uint8Array(readFileSync(cached)));
  const dir = join(OUT, t.id);
  mkdirSync(dir);
  const books: string[] = [];
  let verses = 0;
  let bytes = 0;
  for (const [name, data] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    const m = /^\d+-([A-Z0-9]{3})/.exec(name);
    if (!m || SKIP.has(m[1]) || !name.endsWith('.usfm')) continue;
    const book = parseUsfm(m[1], strFromU8(data));
    const json = JSON.stringify(book);
    writeFileSync(join(dir, `${m[1]}.json`), json);
    books.push(m[1]);
    bytes += json.length;
    for (const c of book.chapters) verses += c.filter((v) => v !== null).length;
  }
  if (books.length !== 66) throw new Error(`${t.id}: expected 66 books, got ${books.length}`);
  console.log(`${t.abbr}: ${books.length} books, ${verses} verses, ${(bytes / 1024 / 1024).toFixed(2)} MB`);
  const { url: _url, ...meta } = t;
  index.push({ ...meta, sourceUrl: t.url, books });
}
writeFileSync(join(OUT, 'index.json'), JSON.stringify({ translations: index }, null, 1));
