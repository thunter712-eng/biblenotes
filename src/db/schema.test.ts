import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { openDb, V1_STORES } from './schema.ts';

describe('migrations', () => {
  it('upgrades a v1 database and keeps its rows', async () => {
    const name = 'migration-test';
    const old = new Dexie(name);
    old.version(1).stores(V1_STORES);
    await old.open();
    await old.table('bookmarks').add({ id: 'b1', ref: 'JHN.3.16', startKey: 43003016 });
    await old.table('notes').add({ id: 'n1', kind: 'inline-text', chapterKey: 'JHN.3', startKey: 43003016, text: 'keep me', tags: [] });
    old.close();

    const db = openDb(name);
    await db.open();
    expect(db.verno).toBe(2);
    expect((await db.bookmarks.get('b1'))?.createdAt).toBe(0);
    expect((await db.notes.get('n1'))?.text).toBe('keep me');
    expect(await db.bookmarks.orderBy('createdAt').count()).toBe(1);
    db.close();
  });

  it('opens a fresh database at the latest version', async () => {
    const db = openDb('fresh-test');
    await db.open();
    expect(db.verno).toBe(2);
    db.close();
  });
});
