import 'fake-indexeddb/auto';
import { beforeEach, expect, it } from 'vitest';
import { db } from '../db/schema.ts';
import { flushDocument, forgetAllDocuments, loadDocument } from './pageStore.ts';
import type { PageObject, StrokeObject } from '../ink/types.ts';

const stroke = (id: string, z: number): StrokeObject => ({
  type: 'stroke', id, z, brush: 'fountain', color: '#123456', width: 3, sim: false, pts: new Float32Array([1, 2, 0.5, 0, 3, 4, 0.75, 8]), bbox: [0, 0, 5, 5],
});

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  forgetAllDocuments();
  await db.pages.add({ id: 'p', notebookId: 'n', title: 't', startKey: 0, template: 'college', paperColor: 'white', sheets: 1, text: '', tags: [], order: 0, createdAt: 0, updatedAt: 0 });
});

it('writes only what changed, and a reload gets the same strokes back', async () => {
  const doc = await loadDocument('p');
  doc.commit({ removed: [], added: [stroke('a', 1), stroke('b', 2)] });
  await flushDocument('p', doc);
  expect(await db.pageObjects.count()).toBe(2);
  expect(doc.dirty.size).toBe(0);

  doc.commit({ removed: [doc.get('a')!], added: [] });
  await flushDocument('p', doc);
  expect(await db.pageObjects.count()).toBe(1);

  forgetAllDocuments();
  const again = await loadDocument('p');
  const s = again.get('b') as StrokeObject;
  expect(s.brush).toBe('fountain');
  expect(s.pts.length).toBe(8);
  expect(s.pts[6]).toBeCloseTo(0.75, 1);
});

it('stores compact bytes rather than a float array', async () => {
  const doc = await loadDocument('p');
  doc.commit({ removed: [], added: [stroke('a', 1)] });
  await flushDocument('p', doc);
  const row = await db.pageObjects.get(['p', 'a']);
  expect((row!.data as { pts: unknown }).pts).toBeInstanceOf(Uint8Array);
});

it('keeps typed text on the page row for search', async () => {
  const doc = await loadDocument('p');
  const box: PageObject = { type: 'text', id: 't', z: 1, x: 0, y: 0, w: 100, h: 20, content: null, text: 'grace alone', scale: 1 };
  doc.commit({ removed: [], added: [box] });
  await flushDocument('p', doc);
  expect((await db.pages.get('p'))!.text).toContain('grace alone');
});
