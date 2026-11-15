import { chapterKey, makeRef, refKey, toRuns, type VerseRef } from '../bible/refs.ts';
import { newId } from '../app/ids.ts';
import { db, type Favorite, type Highlight, type HighlightColor, type HighlightStyle, type Note } from './schema.ts';

/** Sets a whole-verse style on each verse, replacing any earlier one of the same style. */
export async function highlightVerses(book: string, chapter: number, verses: number[], color: HighlightColor, style: HighlightStyle) {
  const key = chapterKey(book, chapter);
  const now = Date.now();
  await db.transaction('rw', db.highlights, async () => {
    const existing = await db.highlights.where('chapterKey').equals(key).toArray();
    const wanted = new Set(verses.map((v) => makeRef(book, chapter, v)));
    const stale = existing.filter((h) => !h.wordRange && h.style === style && wanted.has(h.startRef));
    await db.highlights.bulkDelete(stale.map((h) => h.id));
    await db.highlights.bulkAdd(verses.map((v): Highlight => {
      const ref = makeRef(book, chapter, v);
      return { id: newId(), chapterKey: key, startRef: ref, endRef: ref, startKey: refKey(ref), color, style, createdAt: now, updatedAt: now };
    }));
  });
}

/** Removes every style, whole-verse and word-range, from the given verses. */
export async function clearVerses(book: string, chapter: number, verses: number[]) {
  const wanted = new Set(verses.map((v) => makeRef(book, chapter, v)));
  const rows = await db.highlights.where('chapterKey').equals(chapterKey(book, chapter)).toArray();
  await db.highlights.bulkDelete(rows.filter((h) => wanted.has(h.startRef)).map((h) => h.id));
}

const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start <= b.end && b.start <= a.end;

/** Word positions differ between translations, so word highlights are tied to the translation they were made in. */
export async function highlightWords(translation: string, book: string, chapter: number, verse: number, range: { start: number; end: number }, color: HighlightColor, style: HighlightStyle) {
  const ref = makeRef(book, chapter, verse);
  const now = Date.now();
  await db.transaction('rw', db.highlights, async () => {
    await removeWordRows(ref, translation, range, style);
    await db.highlights.add({ id: newId(), translation, chapterKey: chapterKey(book, chapter), startRef: ref, endRef: ref, startKey: refKey(ref), wordRange: range, color, style, createdAt: now, updatedAt: now });
  });
}

async function removeWordRows(ref: VerseRef, translation: string, range: { start: number; end: number }, style?: HighlightStyle) {
  const rows = await db.highlights.where('startKey').equals(refKey(ref)).toArray();
  const stale = rows.filter((h) => h.wordRange && h.translation === translation && overlaps(h.wordRange, range) && (!style || h.style === style));
  await db.highlights.bulkDelete(stale.map((h) => h.id));
}

export async function clearWords(translation: string, book: string, chapter: number, verse: number, range: { start: number; end: number }) {
  await removeWordRows(makeRef(book, chapter, verse), translation, range);
}

export async function createNote(kind: Note['kind'], book: string, chapter: number, verses: number[]): Promise<Note> {
  const runs = toRuns(verses);
  const start = makeRef(book, chapter, runs[0][0]);
  const end = makeRef(book, chapter, runs[runs.length - 1][1]);
  const now = Date.now();
  const note: Note = {
    id: newId(), kind, anchorStartRef: start, anchorEndRef: end, chapterKey: chapterKey(book, chapter),
    startKey: refKey(start), text: '', collapsed: false, tags: [], createdAt: now, updatedAt: now,
  };
  await db.notes.add(note);
  return note;
}

export const updateNote = (id: string, patch: Partial<Note>) => db.notes.update(id, { ...patch, updatedAt: Date.now() });

/** Deletes a note, along with the hidden page behind an inline-ink note. Returns a function that restores it all. */
export async function deleteNote(id: string): Promise<() => Promise<void>> {
  const note = await db.notes.get(id);
  if (!note) return async () => {};
  const page = note.pageId ? await db.pages.get(note.pageId) : undefined;
  const objects = note.pageId ? await db.pageObjects.where('pageId').equals(note.pageId).toArray() : [];
  await db.transaction('rw', db.notes, db.pages, db.pageObjects, async () => {
    await db.notes.delete(id);
    if (note.pageId) {
      await db.pages.delete(note.pageId);
      await db.pageObjects.where('pageId').equals(note.pageId).delete();
    }
  });
  return async () => {
    await db.transaction('rw', db.notes, db.pages, db.pageObjects, async () => {
      await db.notes.put(note);
      if (page) await db.pages.put(page);
      if (objects.length) await db.pageObjects.bulkPut(objects);
    });
  };
}

export async function toggleBookmark(ref: VerseRef): Promise<boolean> {
  const existing = await db.bookmarks.where('ref').equals(ref).first();
  if (existing) {
    await db.bookmarks.delete(existing.id);
    return false;
  }
  await db.bookmarks.add({ id: newId(), ref, startKey: refKey(ref), createdAt: Date.now() });
  return true;
}

/** The favorite that covers any of these verses, if there is one. */
export async function findFavorite(book: string, chapter: number, verses: number[]): Promise<Favorite | undefined> {
  const rows = await db.favorites.where('chapterKey').equals(chapterKey(book, chapter)).toArray();
  return rows.find((f) => f.verses.some((v) => verses.includes(v)));
}

export async function addFavorite(o: { book: string; chapter: number; verses: number[]; label: string; text: string; abbr: string; addedOn: string; why: string }): Promise<Favorite> {
  const verses = [...o.verses].sort((a, b) => a - b);
  const start = makeRef(o.book, o.chapter, verses[0]);
  const now = Date.now();
  const fav: Favorite = {
    id: newId(), chapterKey: chapterKey(o.book, o.chapter), startRef: start, endRef: makeRef(o.book, o.chapter, verses[verses.length - 1]),
    startKey: refKey(start), verses, label: o.label, text: o.text, abbr: o.abbr, addedOn: o.addedOn, why: o.why, createdAt: now, updatedAt: now,
  };
  await db.favorites.add(fav);
  return fav;
}

export const updateFavorite = (id: string, patch: Partial<Favorite>) => db.favorites.update(id, { ...patch, updatedAt: Date.now() });

/** Removes a favorite. Returns a function that puts it back. */
export async function deleteFavorite(id: string): Promise<() => Promise<void>> {
  const fav = await db.favorites.get(id);
  await db.favorites.delete(id);
  return async () => { if (fav) await db.favorites.put(fav); };
}
