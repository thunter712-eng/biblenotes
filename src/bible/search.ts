import { BOOKS } from './books.ts';
import { loadBook } from './data.ts';
import { decodeVerse } from './layout.ts';
import { makeRef, type VerseRef } from './refs.ts';

export interface SearchHit {
  ref: VerseRef;
  translation: string;
  text: string;
}

const fold = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[’‘]/g, "'").toLowerCase();

/** Returns a tester that needs every word of the query, or the exact phrase when it is in quotes. */
export function makeMatcher(query: string): ((text: string) => boolean) | null {
  const q = fold(query.trim());
  if (!q) return null;
  const phrase = /^"(.+)"$/.exec(q);
  if (phrase) return (t) => fold(t).includes(phrase[1]);
  const words = q.split(/\s+/);
  return (t) => {
    const f = fold(t);
    return words.every((w) => f.includes(w));
  };
}

/**
 * Scans a translation book by book. Hits arrive in batches and the loop yields between books,
 * so the UI stays responsive. Scanning is fast enough that an index would only add precache weight.
 */
export async function searchBible(
  translations: string[],
  query: string,
  onHits: (hits: SearchHit[], progress: number) => void,
  signal: AbortSignal,
): Promise<void> {
  const match = makeMatcher(query);
  if (!match) return;
  const total = translations.length * BOOKS.length;
  let done = 0;
  for (const translation of translations) {
    for (const book of BOOKS) {
      if (signal.aborted) return;
      const data = await loadBook(translation, book.id);
      const hits: SearchHit[] = [];
      data.chapters.forEach((chapter, c) => {
        chapter.forEach((raw, v) => {
          if (!raw) return;
          const plain = decodeVerse(v + 1, raw).plain;
          if (plain && match(plain)) hits.push({ ref: makeRef(book.id, c + 1, v + 1), translation, text: plain });
        });
      });
      done++;
      onHits(hits, done / total);
      await new Promise((r) => setTimeout(r));
    }
  }
}
