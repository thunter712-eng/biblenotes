import { navigate } from '../app/router.ts';
import { parseVerseRef } from '../bible/refs.ts';
import { db } from '../db/schema.ts';

/** Opens a page beside its passage. A free-standing page opens beside wherever the reader last was. */
export async function openPage(pageId: string) {
  const page = await db.pages.get(pageId);
  if (page?.anchorStartRef) {
    const a = parseVerseRef(page.anchorStartRef);
    navigate({ name: 'read', book: a.book, chapter: a.chapter, verse: a.verse, pageId });
    return;
  }
  const last = (await db.kv.get('lastPosition'))?.value as { book: string; chapter: number } | undefined;
  navigate({ name: 'read', book: last?.book ?? 'JHN', chapter: last?.chapter ?? 1, pageId });
}
