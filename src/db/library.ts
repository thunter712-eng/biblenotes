import { newId } from '../app/ids.ts';
import { formatRange, refKey, type VerseRef } from '../bible/refs.ts';
import { fromStored, toStored, type StoredObject } from '../ink/codec.ts';
import { db, type Notebook, type Page, type PaperColor, type PaperTemplate } from './schema.ts';

export const DEFAULT_NOTEBOOK_TITLE = 'Study notes';

export async function createNotebook(title: string, tags: string[] = []): Promise<Notebook> {
  const now = Date.now();
  const nb: Notebook = { id: newId(), title: title.trim() || 'Untitled notebook', tags, createdAt: now, updatedAt: now };
  await db.notebooks.add(nb);
  return nb;
}

export async function defaultNotebook(): Promise<Notebook> {
  const first = await db.notebooks.orderBy('title').first();
  return first ?? createNotebook(DEFAULT_NOTEBOOK_TITLE);
}

export interface NewPageOptions {
  notebookId?: string;
  title?: string;
  startRef?: VerseRef;
  endRef?: VerseRef;
  template?: PaperTemplate;
  paperColor?: PaperColor;
  noteId?: string;
}

export async function createPage(o: NewPageOptions = {}): Promise<Page> {
  const now = Date.now();
  const notebookId = o.noteId ? '' : o.notebookId ?? (await defaultNotebook()).id;
  const count = notebookId ? await db.pages.where('notebookId').equals(notebookId).count() : 0;
  const page: Page = {
    id: newId(),
    notebookId,
    title: o.title ?? (o.startRef ? formatRange(o.startRef, o.endRef) : 'Untitled page'),
    anchorStartRef: o.startRef,
    anchorEndRef: o.endRef ?? o.startRef,
    startKey: o.startRef ? refKey(o.startRef) : 0,
    template: o.template ?? 'college',
    paperColor: o.paperColor ?? 'white',
    sheets: 1,
    text: '',
    noteId: o.noteId,
    tags: [],
    order: count,
    createdAt: now,
    updatedAt: now,
  };
  await db.pages.add(page);
  return page;
}

export const updatePage = (id: string, patch: Partial<Page>) => db.pages.update(id, { ...patch, updatedAt: Date.now() });
export const updateNotebook = (id: string, patch: Partial<Notebook>) => db.notebooks.update(id, { ...patch, updatedAt: Date.now() });

/** Copies a page and all its objects. Row ids are fresh, so the copies edit independently. */
export async function duplicatePage(id: string): Promise<Page | undefined> {
  const page = await db.pages.get(id);
  if (!page) return undefined;
  const now = Date.now();
  const copy: Page = { ...page, id: newId(), title: `${page.title} copy`, createdAt: now, updatedAt: now };
  const rows = await db.pageObjects.where('pageId').equals(id).toArray();
  await db.transaction('rw', db.pages, db.pageObjects, async () => {
    await db.pages.add(copy);
    await db.pageObjects.bulkAdd(rows.map((r) => {
      const obj = { ...fromStored(r.data as StoredObject), id: newId() };
      return { pageId: copy.id, id: obj.id, data: toStored(obj) };
    }));
  });
  return copy;
}

export async function deletePage(id: string): Promise<() => Promise<void>> {
  const page = await db.pages.get(id);
  const rows = await db.pageObjects.where('pageId').equals(id).toArray();
  await db.transaction('rw', db.pages, db.pageObjects, async () => {
    await db.pages.delete(id);
    await db.pageObjects.where('pageId').equals(id).delete();
  });
  return async () => {
    if (!page) return;
    await db.transaction('rw', db.pages, db.pageObjects, async () => {
      await db.pages.put(page);
      await db.pageObjects.bulkPut(rows);
    });
  };
}

/** Deletes a notebook and its pages, returning an undo. */
export async function deleteNotebook(id: string): Promise<() => Promise<void>> {
  const notebook = await db.notebooks.get(id);
  const pages = await db.pages.where('notebookId').equals(id).toArray();
  const undos = await Promise.all(pages.map((p) => deletePage(p.id)));
  await db.notebooks.delete(id);
  return async () => {
    if (notebook) await db.notebooks.put(notebook);
    await Promise.all(undos.map((u) => u()));
  };
}

/** The most recently edited visible pages anchored inside a chapter. */
export async function pagesForChapter(book: string, chapter: number): Promise<Page[]> {
  const low = refKey(`${book}.${chapter}.0`);
  const high = refKey(`${book}.${chapter}.999`);
  const pages = await db.pages.where('startKey').between(low, high, true, true).toArray();
  return pages.filter((p) => p.notebookId).sort((a, b) => b.updatedAt - a.updatedAt);
}
