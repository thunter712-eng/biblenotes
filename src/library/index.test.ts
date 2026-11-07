import { describe, expect, it } from 'vitest';
import { refKey } from '../bible/refs.ts';
import type { Bookmark, Note, Page } from '../db/schema.ts';
import { allTags, buildIndex, filterIndex, groupByBook, STUDY_TOPICS } from './index.ts';

const note = (id: string, ref: string, text: string, tags: string[] = []): Note => ({
  id, kind: 'inline-text', anchorStartRef: ref, anchorEndRef: ref, chapterKey: ref.split('.').slice(0, 2).join('.'), startKey: refKey(ref), text, collapsed: false, tags, createdAt: 0, updatedAt: 1,
});
const page = (id: string, ref: string | undefined, title: string, extra: Partial<Page> = {}): Page => ({
  id, notebookId: 'nb', title, anchorStartRef: ref, anchorEndRef: ref, startKey: ref ? refKey(ref) : 0, template: 'college', paperColor: 'white', sheets: 1, text: '', tags: [], order: 0, createdAt: 0, updatedAt: 1, ...extra,
});
const bookmark: Bookmark = { id: 'b', ref: 'GEN.1.1', startKey: refKey('GEN.1.1'), createdAt: 1 };

describe('notes index', () => {
  const entries = buildIndex(
    [note('r', 'ROM.8.1', 'No condemnation', ['grace']), note('j', 'JHN.3.16', 'Love sends')],
    [page('p', 'JHN.3.1', 'Nicodemus'), page('free', undefined, 'Sermon on hope', { text: 'hope does not disappoint' }), page('hidden', 'JHN.1.1', 'behind a note', { notebookId: '' })],
    [bookmark],
  );

  it('sorts in canonical order with free-standing pages last', () => {
    expect(entries.map((e) => e.key)).toEqual(['bm-b', 'page-p', 'note-j', 'note-r', 'page-free']);
  });
  it('groups by book', () => {
    expect(groupByBook(entries).map((g) => g.group)).toEqual(['Genesis', 'John', 'Romans', STUDY_TOPICS]);
  });
  it('filters by kind, book and tag', () => {
    expect(filterIndex(entries, { kinds: ['typed'] }).length).toBe(2);
    expect(filterIndex(entries, { book: 'JHN' }).length).toBe(2);
    expect(filterIndex(entries, { tag: 'grace' }).map((e) => e.noteId)).toEqual(['r']);
    expect(allTags(entries)).toEqual(['grace']);
  });
  it('searches typed note text and page text', () => {
    expect(filterIndex(entries, { query: 'condemnation' }).map((e) => e.noteId)).toEqual(['r']);
    expect(filterIndex(entries, { query: 'DISAPPOINT' }).map((e) => e.pageId)).toEqual(['free']);
    expect(filterIndex(entries, { query: 'john love' }).map((e) => e.noteId)).toEqual(['j']);
  });
  it('carries what is needed to jump to a passage', () => {
    expect(entries.find((e) => e.noteId === 'j')).toMatchObject({ book: 'JHN', chapter: 3, verse: 16 });
  });
});
