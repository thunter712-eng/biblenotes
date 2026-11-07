import 'fake-indexeddb/auto';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPage } from '../db/library.ts';
import { db } from '../db/schema.ts';
import { createNote, highlightVerses, updateNote } from '../db/study.ts';
import { toStored, type StoredObject } from '../ink/codec.ts';
import type { StrokeObject } from '../ink/types.ts';
import { createBackup, lastBackupAt, readBackup, restoreMerge, restoreReplace } from './backup.ts';

const stroke = (id: string): StrokeObject => ({ type: 'stroke', id, z: 1, brush: 'pencil', color: '#111111', width: 3, sim: false, pts: new Float32Array([1, 2, 0.5, 0, 9, 8, 0.5, 8]), bbox: [0, 0, 10, 10] });

async function seed() {
  const note = await createNote('inline-text', 'JHN', 3, [16]);
  await updateNote(note.id, { text: 'Love sends', content: { type: 'doc' } });
  await highlightVerses('JHN', 3, [16, 17], 'yellow', 'highlight');
  const page = await createPage({ startRef: 'JHN.3.16' });
  await db.pageObjects.add({ pageId: page.id, id: 's1', data: toStored(stroke('s1')) });
  await db.images.add({ id: 'img', blob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' }), createdAt: 5 });
  await db.bookmarks.add({ id: 'b1', ref: 'JHN.3.16', startKey: 1, createdAt: 1 });
  return { note, page };
}

const clearAll = () => Promise.all(db.tables.map((t) => t.clear()));

beforeEach(clearAll);

describe('backup', () => {
  it('round-trips everything through a zip, replacing the device', async () => {
    const { note, page } = await seed();
    const blob = await createBackup();
    expect(await lastBackupAt()).toBeGreaterThan(0);
    await clearAll();

    const parsed = await readBackup(blob);
    const summary = await restoreReplace(parsed);
    expect(summary).toEqual({ notes: 1, pages: 2 - 1, highlights: 2 });
    expect((await db.notes.get(note.id))?.text).toBe('Love sends');
    expect(await db.highlights.count()).toBe(2);
    expect(await db.bookmarks.count()).toBe(1);

    const row = await db.pageObjects.get([page.id, 's1']);
    const pts = (row!.data as StoredObject & { pts: Uint8Array }).pts;
    expect(pts).toBeInstanceOf(Uint8Array);
    expect(pts.length).toBeGreaterThan(4);

    const img = await db.images.get('img');
    expect(img?.blob.type).toBe('image/png');
    expect(new Uint8Array(await img!.blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it('replace removes what the backup does not have', async () => {
    await seed();
    const blob = await createBackup();
    const extra = await createNote('inline-text', 'ROM', 8, [1]);
    await restoreReplace(await readBackup(blob));
    expect(await db.notes.get(extra.id)).toBeUndefined();
  });

  it('merge keeps new local work and the newer of two edits', async () => {
    const { note, page } = await seed();
    const blob = await createBackup();

    // After the backup: a new note, and an edit to the old one. The backup is older.
    await new Promise((r) => setTimeout(r, 5));
    const added = await createNote('inline-text', 'ROM', 8, [1]);
    await updateNote(note.id, { text: 'Edited after the backup' });

    await restoreMerge(await readBackup(blob));
    expect(await db.notes.get(added.id)).toBeDefined();
    expect((await db.notes.get(note.id))?.text).toBe('Edited after the backup');
    expect(await db.pageObjects.where('pageId').equals(page.id).count()).toBe(1);
  });

  it('merge brings a deleted page back along with its strokes', async () => {
    const { page } = await seed();
    const blob = await createBackup();
    await db.pages.delete(page.id);
    await db.pageObjects.where('pageId').equals(page.id).delete();
    const summary = await restoreMerge(await readBackup(blob));
    expect(summary.pages).toBe(1);
    expect(await db.pageObjects.where('pageId').equals(page.id).count()).toBe(1);
  });

  it('merge does not duplicate a bookmark on the same verse', async () => {
    await seed();
    const blob = await createBackup();
    await db.bookmarks.clear();
    await db.bookmarks.add({ id: 'different-id', ref: 'JHN.3.16', startKey: 1, createdAt: 2 });
    await restoreMerge(await readBackup(blob));
    expect(await db.bookmarks.count()).toBe(1);
  });

  it('accepts a bare backup.json', async () => {
    await seed();
    const files = unzipSync(new Uint8Array(await (await createBackup()).arrayBuffer()));
    const parsed = await readBackup(new Blob([strFromU8(files['backup.json'])]));
    expect(parsed.data.notes.length).toBe(1);
  });

  it.each([
    ['a text file', new Blob(['hello']), /not a Bible Notes backup/],
    ['unrelated JSON', new Blob(['{"a":1}']), /not a Bible Notes backup/],
    ['an unrelated zip', new Blob([zipSync({ 'x.txt': strToU8('x') }) as BlobPart]), /no backup.json/],
    ['a newer format', new Blob(['{"format":"bible-notes-backup","version":99}']), /newer version/],
  ])('refuses %s without touching data', async (_n, blob, message) => {
    await seed();
    await expect(readBackup(blob)).rejects.toThrow(message);
    expect(await db.notes.count()).toBe(1);
  });
});
