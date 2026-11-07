import { BOOKS, bookIndex, findBook, getBook } from './books.ts';

/** Translation-independent verse id, such as "JHN.3.16". */
export type VerseRef = string;

export interface VerseAddr {
  book: string;
  chapter: number;
  verse: number;
}

export const makeRef = (book: string, chapter: number, verse: number): VerseRef => `${book}.${chapter}.${verse}`;
export const chapterKey = (book: string, chapter: number): string => `${book}.${chapter}`;

export function parseVerseRef(ref: VerseRef): VerseAddr {
  const [book, c, v] = ref.split('.');
  return { book, chapter: +c, verse: +v };
}

/** Numeric key in canonical Bible order, used for sorting and range lookups. */
export function refKey(ref: VerseRef): number {
  const { book, chapter, verse } = parseVerseRef(ref);
  return (bookIndex(book) + 1) * 1_000_000 + chapter * 1_000 + verse;
}

export interface ParsedReference {
  book: string;
  chapter: number;
  verseStart?: number;
  verseEnd?: number;
  /** Set when the range runs into a later chapter: "John 3:16-4:2". */
  chapterEnd?: number;
}

/** Parses "John 3:16", "1 Cor 13", "Ps 23:1-4", "Jude 5", "John 3:16-4:2" and "Rom". Returns null if not understood. */
export function parseReference(input: string): ParsedReference | null {
  const text = input.trim().replace(/[–—]/g, '-').replace(/\s+/g, ' ');
  const m = /^((?:[1-3]|i{1,3}|1st|2nd|3rd)?\s?[a-z][a-z .]*?)\.?\s*(\d+)?(?:\s?[:.]\s?(\d+))?(?:\s?-\s?(\d+)(?:\s?[:.]\s?(\d+))?)?$/i.exec(text);
  if (!m) return null;
  const book = findBook(m[1]);
  if (!book) return null;
  const a = m[2] ? +m[2] : undefined;
  const b = m[3] ? +m[3] : undefined;
  const c = m[4] ? +m[4] : undefined;
  const d = m[5] ? +m[5] : undefined;

  if (a === undefined) return { book: book.id, chapter: 1 };

  // In one-chapter books a lone number means a verse: "Jude 5", "Phm 3-4".
  if (book.chapters === 1 && b === undefined) {
    return { book: book.id, chapter: 1, verseStart: a, verseEnd: c ?? a };
  }
  if (a < 1 || a > book.chapters) return null;
  if (b === undefined) {
    // "Ps 23-24" is a chapter range. The reader opens the first chapter.
    if (c !== undefined && (c <= a || c > book.chapters)) return null;
    return { book: book.id, chapter: a, ...(c !== undefined ? { chapterEnd: c } : {}) };
  }
  if (d !== undefined) {
    return { book: book.id, chapter: a, verseStart: b, chapterEnd: c, verseEnd: d };
  }
  return { book: book.id, chapter: a, verseStart: b, verseEnd: c ?? b };
}

/** Formats a sorted verse list as "16-17, 19". */
export function formatVerseList(verses: number[]): string {
  const sorted = [...new Set(verses)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i];
    while (i + 1 < sorted.length && sorted[i + 1] === sorted[i] + 1) i++;
    parts.push(start === sorted[i] ? `${start}` : `${start}-${sorted[i]}`);
  }
  return parts.join(', ');
}

/** "John 3:16-17". Single-verse and whole-chapter forms read naturally. */
export function formatRange(startRef: VerseRef, endRef: VerseRef = startRef): string {
  const s = parseVerseRef(startRef);
  const e = parseVerseRef(endRef);
  const name = getBook(s.book)?.name ?? s.book;
  if (s.book !== e.book) return `${name} ${s.chapter}:${s.verse} - ${getBook(e.book)?.name ?? e.book} ${e.chapter}:${e.verse}`;
  if (s.chapter !== e.chapter) return `${name} ${s.chapter}:${s.verse}-${e.chapter}:${e.verse}`;
  if (s.verse === e.verse) return `${name} ${s.chapter}:${s.verse}`;
  return `${name} ${s.chapter}:${s.verse}-${e.verse}`;
}

export function formatVerses(book: string, chapter: number, verses: number[]): string {
  return `${getBook(book)?.name ?? book} ${chapter}:${formatVerseList(verses)}`;
}

/** Splits a sorted verse list into contiguous runs. */
export function toRuns(verses: number[]): [number, number][] {
  const sorted = [...new Set(verses)].sort((a, b) => a - b);
  const runs: [number, number][] = [];
  for (const v of sorted) {
    const last = runs[runs.length - 1];
    if (last && last[1] === v - 1) last[1] = v;
    else runs.push([v, v]);
  }
  return runs;
}

/** The next or previous chapter in canonical order, or null at the ends of the Bible. */
export function adjacentChapter(book: string, chapter: number, delta: 1 | -1): { book: string; chapter: number } | null {
  const info = getBook(book);
  if (!info) return null;
  const next = chapter + delta;
  if (next >= 1 && next <= info.chapters) return { book, chapter: next };
  const i = bookIndex(book) + delta;
  const other = BOOKS[i];
  if (!other) return null;
  return { book: other.id, chapter: delta > 0 ? 1 : other.chapters };
}
