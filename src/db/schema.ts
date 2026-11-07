import Dexie, { type EntityTable, type Transaction } from 'dexie';
import type { VerseRef } from '../bible/refs.ts';

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'orange' | 'purple';
export type HighlightStyle = 'highlight' | 'underline' | 'strike';

export interface Highlight {
  id: string;
  /** Set for word ranges, whose positions only make sense in one translation. */
  translation?: string;
  chapterKey: string;
  startRef: VerseRef;
  endRef: VerseRef;
  startKey: number;
  /** Word indexes in the startRef verse, inclusive. */
  wordRange?: { start: number; end: number };
  color: HighlightColor;
  style: HighlightStyle;
  createdAt: number;
  updatedAt: number;
}

export type NoteKind = 'inline-text' | 'inline-ink';

export interface Note {
  id: string;
  kind: NoteKind;
  anchorStartRef: VerseRef;
  anchorEndRef: VerseRef;
  chapterKey: string;
  startKey: number;
  /** Tiptap JSON for inline-text notes. */
  content?: unknown;
  /** Plain text, for search. */
  text: string;
  /** For inline-ink notes: the hidden page that holds the ink. */
  pageId?: string;
  collapsed: boolean;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface Notebook {
  id: string;
  title: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export type PaperTemplate = 'college' | 'wide' | 'grid' | 'dot' | 'blank' | 'cornell';
export type PaperColor = 'white' | 'cream' | 'dark';

export interface Page {
  id: string;
  /** Empty string for the hidden pages behind inline-ink notes. */
  notebookId: string;
  title: string;
  anchorStartRef?: VerseRef;
  anchorEndRef?: VerseRef;
  /** Canonical sort key, or 0 for a free-standing page. */
  startKey: number;
  template: PaperTemplate;
  paperColor: PaperColor;
  /** How many sheets tall the page has grown. */
  sheets: number;
  /** Typed text gathered from text boxes and quotes, for search. */
  text: string;
  /** Set for the hidden page behind an inline-ink note. */
  noteId?: string;
  tags: string[];
  order: number;
  createdAt: number;
  updatedAt: number;
}

/** One row per stroke or object, so autosave writes only what changed. See src/ink/types.ts for `data`. */
export interface PageObjectRow {
  pageId: string;
  id: string;
  data: unknown;
}

export interface ImageRow {
  id: string;
  blob: Blob;
  createdAt: number;
}

export interface Bookmark {
  id: string;
  ref: VerseRef;
  startKey: number;
  createdAt: number;
}

export interface HistoryEntry {
  /** "JHN.3": one row per chapter, refreshed on each visit. */
  chapterKey: string;
  visitedAt: number;
}

export interface KvRow {
  key: string;
  value: unknown;
}

export type BibleNotesDb = Dexie & {
  highlights: EntityTable<Highlight, 'id'>;
  notes: EntityTable<Note, 'id'>;
  notebooks: EntityTable<Notebook, 'id'>;
  pages: EntityTable<Page, 'id'>;
  pageObjects: Dexie.Table<PageObjectRow, [string, string]>;
  images: EntityTable<ImageRow, 'id'>;
  bookmarks: EntityTable<Bookmark, 'id'>;
  history: EntityTable<HistoryEntry, 'chapterKey'>;
  kv: EntityTable<KvRow, 'key'>;
};

export const DB_NAME = 'bible-notes';

/** Schema v1. Migrations must never edit an existing version: add a new one below. */
export const V1_STORES = {
  highlights: 'id, chapterKey, startKey',
  notes: 'id, kind, chapterKey, startKey, *tags, updatedAt',
  notebooks: 'id, title, *tags',
  pages: 'id, notebookId, startKey, noteId, *tags, updatedAt',
  pageObjects: '[pageId+id], pageId',
  images: 'id',
  bookmarks: 'id, ref, startKey',
  history: 'chapterKey, visitedAt',
  kv: 'key',
};

/** v2: indexes Bookmark.createdAt for newest-first lists and backfills it on older rows. */
export const V2_STORES = { bookmarks: 'id, ref, startKey, createdAt' };

export async function migrateToV2(tx: Transaction): Promise<void> {
  await tx.table('bookmarks').toCollection().modify((b: Partial<Bookmark>) => {
    b.createdAt ??= 0;
  });
}

export function openDb(name = DB_NAME): BibleNotesDb {
  const db = new Dexie(name) as BibleNotesDb;
  db.version(1).stores(V1_STORES);
  db.version(2).stores(V2_STORES).upgrade(migrateToV2);
  return db;
}

export const db = openDb();
export const SCHEMA_VERSION = 2;
