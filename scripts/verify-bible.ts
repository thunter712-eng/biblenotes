// Compares the generated JSON word for word against eBible's verse-per-line edition of each translation,
// an independent rendering of the same text. Run with: node scripts/verify-bible.ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { TRANSLATIONS } from './translations.config.ts';

const norm = (s: string) => s.replace(/[¶§‡]/g, '').replace(/\s+/g, ' ').trim();

// The two editions lay the same words out differently: the reference brackets the ASV's supplied
// words, and folds psalm titles and speaker labels into the verse they precede.
const plainReference = (s: string) => norm(s);
// Spacing and brackets differ between the editions, so compare the characters that make up the words.
const bare = (s: string) => s.replace(/[[\]\s]/g, '');

// Where the reference spells a book code differently from USFM.
const REFERENCE_CODES: Record<string, string> = { SOL: 'SNG', EZE: 'EZK', JOE: 'JOL', NAH: 'NAM', MAR: 'MRK', JOH: 'JHN', PHI: 'PHP', JAM: 'JAS', '1JO': '1JN', '2JO': '2JN', '3JO': '3JN' };
let failures = 0;

for (const t of TRANSLATIONS) {
  const url = t.url.replace('_usfm.zip', '_vpl.zip');
  const cached = join('.bible-cache', `${t.id}-vpl.zip`);
  if (!existsSync(cached)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    writeFileSync(cached, new Uint8Array(await res.arrayBuffer()));
  }
  const files = unzipSync(new Uint8Array(readFileSync(cached)));
  const name = Object.keys(files).find((n) => n.endsWith('.txt') && !/readme|copyright/i.test(n));
  if (!name) throw new Error(`${url}: no text file inside`);

  const reference = new Map<string, string>();
  for (const line of strFromU8(files[name]).split(/\r?\n/)) {
    const m = /^([A-Z0-9]{3}) (\d+):(\d+)\s+(.*)$/.exec(line);
    if (m) reference.set(`${REFERENCE_CODES[m[1]] ?? m[1]}.${m[2]}.${m[3]}`, plainReference(m[4]));
  }

  let compared = 0;
  const diffs: string[] = [];
  const seen = new Set<string>();
  for (const book of JSON.parse(readFileSync(`public/bible/index.json`, 'utf8')).translations.find((x: { id: string }) => x.id === t.id).books as string[]) {
    const data = JSON.parse(readFileSync(`public/bible/${t.id}/${book}.json`, 'utf8'));
    (data.chapters as (string | null)[][]).forEach((chapter, c) => chapter.forEach((raw, v) => {
      const key = `${book}.${c + 1}.${v + 1}`;
      seen.add(key);
      const ours = norm(raw ?? '');
      const theirs = reference.get(key);
      if (theirs === undefined) {
        if (ours) diffs.push(`${key}: not in the reference`);
        return;
      }
      compared++;
      // Any trailing run of the headings may be folded in: the reference leaves out "BOOK 2" but keeps psalm titles.
      const labels = [...(v === 0 ? data.headings?.[c + 1] ?? [] : []), ...(data.verseHeadings?.[`${c + 1}.${v + 1}`] ?? [])];
      const accepted = labels.map((_: string, i: number) => bare(labels.slice(i).join('') + ours));
      // Labels between verses can sit at the end of the verse before them, as in Psalm 119.
      const next = data.verseHeadings?.[`${c + 1}.${v + 2}`];
      if (next) accepted.push(bare(ours + next.join('')));
      if (bare(ours) !== bare(theirs) && !accepted.includes(bare(theirs))) diffs.push(`${key}\n  ours:   ${ours}\n  theirs: ${theirs}`);
    }));
  }
  for (const [key, text] of reference) if (!seen.has(key) && text) diffs.push(`${key}: missing from our output`);
  console.log(`${t.abbr}: compared ${compared} verses against ${reference.size} reference lines, ${diffs.length} differences`);
  diffs.slice(0, 14).forEach((d) => console.log(d));
  failures += diffs.length;
}
process.exitCode = failures ? 1 : 0;
