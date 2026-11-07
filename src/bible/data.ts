import { decodeVerse, type DecodedVerse } from './layout.ts';

export interface TranslationInfo {
  id: string;
  abbr: string;
  name: string;
  year: string;
  license: string;
  licenseUrl: string;
  attribution: string;
  sourceUrl: string;
  books: string[];
}

interface BookJson {
  id: string;
  name: string;
  chapters: (string | null)[][];
  headings?: Record<string, string[]>;
  verseHeadings?: Record<string, string[]>;
}

const url = (path: string) => `${import.meta.env.BASE_URL}bible/${path}`;

let indexPromise: Promise<TranslationInfo[]> | null = null;
const books = new Map<string, Promise<BookJson>>();

export function loadTranslations(): Promise<TranslationInfo[]> {
  indexPromise ??= fetch(url('index.json')).then((r) => {
    if (!r.ok) throw new Error(`Could not load the translation list (HTTP ${r.status}).`);
    return r.json().then((j: { translations: TranslationInfo[] }) => j.translations);
  });
  return indexPromise;
}

export function loadBook(translation: string, book: string): Promise<BookJson> {
  const key = `${translation}/${book}`;
  let p = books.get(key);
  if (!p) {
    p = fetch(url(`${key}.json`)).then((r) => {
      if (!r.ok) throw new Error(`Could not load ${book} (HTTP ${r.status}).`);
      return r.json() as Promise<BookJson>;
    });
    p.catch(() => books.delete(key));
    books.set(key, p);
  }
  return p;
}

export interface ChapterData {
  verses: DecodedVerse[];
  headings: string[];
}

export async function loadChapter(translation: string, book: string, chapter: number): Promise<ChapterData> {
  const data = await loadBook(translation, book);
  const raw = data.chapters[chapter - 1] ?? [];
  const verses: DecodedVerse[] = [];
  raw.forEach((v, i) => {
    // Some verse numbers are intentionally empty, such as Luke 17:36 in the WEB.
    if (v && v.replace(/^[¶§]/, '').trim()) {
      const labels = data.verseHeadings?.[`${chapter}.${i + 1}`];
      verses.push({ ...decodeVerse(i + 1, v), ...(labels ? { labels } : {}) });
    }
  });
  return { verses, headings: data.headings?.[chapter] ?? [] };
}

export async function getVerseTexts(translation: string, book: string, chapter: number, verses: number[]): Promise<string> {
  const { verses: all } = await loadChapter(translation, book, chapter);
  const wanted = new Set(verses);
  return all.filter((v) => wanted.has(v.number)).map((v) => v.plain).join(' ');
}
