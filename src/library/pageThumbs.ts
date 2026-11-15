import { useEffect, useState } from 'react';
import type { Page } from '../db/schema.ts';
import { renderSheet } from '../backup/exportPage.ts';
import { loadDocument } from '../notebook/pageStore.ts';

const THUMB_SCALE = 0.32;
const cache = new Map<string, string>();
let queue: Promise<unknown> = Promise.resolve();

const keyOf = (p: Page) => `${p.id}:${p.updatedAt}:${p.template}:${p.paperColor}:${p.date ?? ''}:${p.title}`;

/** Paints the first sheet of a page, small. One at a time, since iPad Safari kills pages that hold many canvases. */
function render(page: Page): Promise<string> {
  const job = queue.then(async () => {
    await document.fonts?.ready;
    const doc = await loadDocument(page.id);
    const canvas = await renderSheet(page, doc.objects, 0, THUMB_SCALE);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
    canvas.width = canvas.height = 0;
    return blob ? URL.createObjectURL(blob) : '';
  });
  queue = job.catch(() => {});
  return job;
}

/** A preview of the page's first sheet, refreshed whenever the page changes. */
export function usePageThumb(page: Page): string | null {
  const key = keyOf(page);
  const [url, setUrl] = useState<string | null>(() => cache.get(key) ?? null);
  useEffect(() => {
    const hit = cache.get(key);
    if (hit) { setUrl(hit); return; }
    let live = true;
    void render(page).then((u) => {
      if (!u) return;
      // Drop the stale preview for this page.
      for (const [k, old] of cache) if (k.startsWith(`${page.id}:`)) { URL.revokeObjectURL(old); cache.delete(k); }
      cache.set(key, u);
      if (live) setUrl(u);
    }).catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return url;
}
