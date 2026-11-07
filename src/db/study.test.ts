import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema.ts';
import { clearVerses, clearWords, createNote, deleteNote, highlightVerses, highlightWords, toggleBookmark } from './study.ts';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('highlights', () => {
  it('stores one row per verse and recolors in place', async () => {
    await highlightVerses('JHN', 3, [16, 17], 'yellow', 'highlight');
    await highlightVerses('JHN', 3, [17], 'blue', 'highlight');
    const rows = await db.highlights.orderBy('startKey').toArray();
    expect(rows.map((r) => [r.startRef, r.color])).toEqual([['JHN.3.16', 'yellow'], ['JHN.3.17', 'blue']]);
  });
  it('keeps different styles side by side', async () => {
    await highlightVerses('JHN', 3, [16], 'yellow', 'highlight');
    await highlightVerses('JHN', 3, [16], 'pink', 'underline');
    expect(await db.highlights.count()).toBe(2);
  });
  it('clears only the chosen verses', async () => {
    await highlightVerses('JHN', 3, [16, 17], 'yellow', 'highlight');
    await clearVerses('JHN', 3, [16]);
    expect((await db.highlights.toArray()).map((r) => r.startRef)).toEqual(['JHN.3.17']);
  });
  it('replaces overlapping word ranges of the same translation only', async () => {
    await highlightWords('web', 'JHN', 3, 16, { start: 0, end: 3 }, 'yellow', 'highlight');
    await highlightWords('asv', 'JHN', 3, 16, { start: 0, end: 3 }, 'green', 'highlight');
    await highlightWords('web', 'JHN', 3, 16, { start: 2, end: 5 }, 'blue', 'highlight');
    const rows = await db.highlights.toArray();
    expect(rows.map((r) => r.color).sort()).toEqual(['blue', 'green']);
    await clearWords('web', 'JHN', 3, 16, { start: 4, end: 4 });
    expect((await db.highlights.toArray()).map((r) => r.color)).toEqual(['green']);
  });
});

describe('notes', () => {
  it('anchors from the first to the last selected verse', async () => {
    const n = await createNote('inline-text', 'JHN', 3, [17, 16]);
    expect([n.anchorStartRef, n.anchorEndRef]).toEqual(['JHN.3.16', 'JHN.3.17']);
  });
  it('restores a deleted note', async () => {
    const n = await createNote('inline-text', 'JHN', 3, [16]);
    const undo = await deleteNote(n.id);
    expect(await db.notes.count()).toBe(0);
    await undo();
    expect((await db.notes.get(n.id))?.anchorStartRef).toBe('JHN.3.16');
  });
});

it('toggles bookmarks', async () => {
  expect(await toggleBookmark('JHN.3.16')).toBe(true);
  expect(await toggleBookmark('JHN.3.16')).toBe(false);
  expect(await db.bookmarks.count()).toBe(0);
});
