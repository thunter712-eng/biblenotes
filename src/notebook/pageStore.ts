import { fromStored, toStored, type StoredObject } from '../ink/codec.ts';
import { PageDocument } from '../ink/document.ts';
import { isBox, type PageObject } from '../ink/types.ts';
import { db } from '../db/schema.ts';

/** Documents stay in memory for the session, so undo history survives switching between pages. */
const docs = new Map<string, Promise<PageDocument>>();

export function loadDocument(pageId: string): Promise<PageDocument> {
  let p = docs.get(pageId);
  if (!p) {
    p = db.pageObjects.where('pageId').equals(pageId).toArray().then((rows) => new PageDocument(rows.map((r) => fromStored(r.data as StoredObject))));
    docs.set(pageId, p);
  }
  return p;
}

export function forgetDocument(pageId: string) {
  docs.delete(pageId);
}

/** Drops every cached document, after a restore replaces the data. */
export function forgetAllDocuments() {
  docs.clear();
}

function pageText(objects: readonly PageObject[]): string {
  return objects.filter(isBox).map((o) => (o.type === 'text' ? o.text : o.type === 'quote' ? `${o.label} ${o.text}` : '')).filter(Boolean).join('\n');
}

export async function flushDocument(pageId: string, doc: PageDocument) {
  if (!doc.dirty.size && !doc.deleted.size) return;
  const put = [...doc.dirty].map((id) => doc.get(id)).filter(Boolean) as PageObject[];
  const del = [...doc.deleted];
  doc.dirty.clear();
  doc.deleted.clear();
  await db.transaction('rw', db.pageObjects, db.pages, async () => {
    if (put.length) await db.pageObjects.bulkPut(put.map((o) => ({ pageId, id: o.id, data: toStored(o) })));
    if (del.length) await db.pageObjects.bulkDelete(del.map((id) => [pageId, id] as [string, string]));
    await db.pages.update(pageId, { updatedAt: Date.now(), text: pageText(doc.objects) });
  });
}

const SAVE_DELAY_MS = 400;

/**
 * Saves changed rows shortly after each edit. iOS can kill a backgrounded web app without warning,
 * so it also saves the moment the page is hidden. Returns a function that stops and saves once more.
 */
export function attachAutosave(pageId: string, doc: PageDocument): () => void {
  let timer = 0;
  const flush = () => {
    clearTimeout(timer);
    timer = 0;
    void flushDocument(pageId, doc);
  };
  const unsub = doc.onChange((e) => {
    if (!e.removed.length && !e.added.length) return;
    clearTimeout(timer);
    timer = window.setTimeout(flush, SAVE_DELAY_MS);
  });
  const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', flush);
  return () => {
    unsub();
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', flush);
    flush();
  };
}
