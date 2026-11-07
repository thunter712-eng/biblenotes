import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema.ts';
import { createNotebook, createPage, defaultNotebook, deleteNotebook, deletePage, duplicatePage, pagesForChapter } from './library.ts';
import { toStored } from '../ink/codec.ts';
import type { StrokeObject } from '../ink/types.ts';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

const strokeRow = (pageId: string, id: string) => {
  const s: StrokeObject = { type: 'stroke', id, z: 1, brush: 'ballpoint', color: 'auto', width: 2, sim: false, pts: new Float32Array([1, 2, 0.5, 0]), bbox: [0, 0, 3, 3] };
  return { pageId, id, data: toStored(s) };
};

describe('pages', () => {
  it('makes a default notebook on demand and reuses it', async () => {
    const a = await defaultNotebook();
    const b = await defaultNotebook();
    expect(a.id).toBe(b.id);
    expect(await db.notebooks.count()).toBe(1);
  });
  it('titles anchored pages by their passage', async () => {
    const p = await createPage({ startRef: 'JHN.3.16', endRef: 'JHN.3.17' });
    expect(p.title).toBe('John 3:16-17');
    expect(p.template).toBe('college');
  });
  it('duplicates a page and all its strokes', async () => {
    const p = await createPage();
    await db.pageObjects.add(strokeRow(p.id, 's1'));
    const copy = (await duplicatePage(p.id))!;
    const rows = await db.pageObjects.where('pageId').equals(copy.id).toArray();
    expect(rows.length).toBe(1);
    expect(rows[0].id).not.toBe('s1');
    expect(await db.pageObjects.where('pageId').equals(p.id).count()).toBe(1);
  });
  it('restores a deleted page with its strokes', async () => {
    const p = await createPage();
    await db.pageObjects.add(strokeRow(p.id, 's1'));
    const undo = await deletePage(p.id);
    expect(await db.pages.count()).toBe(0);
    expect(await db.pageObjects.count()).toBe(0);
    await undo();
    expect(await db.pages.count()).toBe(1);
    expect(await db.pageObjects.count()).toBe(1);
  });
  it('restores a deleted notebook with its pages', async () => {
    const nb = await createNotebook('Romans study');
    await createPage({ notebookId: nb.id });
    const undo = await deleteNotebook(nb.id);
    expect(await db.notebooks.count()).toBe(0);
    await undo();
    expect(await db.pages.where('notebookId').equals(nb.id).count()).toBe(1);
  });
  it('finds pages by chapter, leaving out the hidden pages behind ink notes', async () => {
    const shown = await createPage({ startRef: 'JHN.3.16' });
    await createPage({ startRef: 'JHN.4.1' });
    await createPage({ startRef: 'JHN.3.20', noteId: 'n1' });
    expect((await pagesForChapter('JHN', 3)).map((p) => p.id)).toEqual([shown.id]);
  });
});
