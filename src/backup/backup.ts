import type { Table } from 'dexie';
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { db, SCHEMA_VERSION, type Bookmark, type HistoryEntry, type Highlight, type ImageRow, type Note, type Notebook, type Page, type PageObjectRow } from '../db/schema.ts';

const FORMAT = 'bible-notes-backup';
const FORMAT_VERSION = 1;

interface BackupImage {
  id: string;
  file: string;
  type: string;
  createdAt: number;
}

export interface BackupData {
  format: typeof FORMAT;
  version: number;
  schema: number;
  exportedAt: number;
  highlights: Highlight[];
  notes: Note[];
  notebooks: Notebook[];
  pages: Page[];
  pageObjects: PageObjectRow[];
  bookmarks: Bookmark[];
  history: HistoryEntry[];
  settings: Record<string, unknown>;
  images: BackupImage[];
}

const toBase64 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Stroke points are bytes, which JSON can't hold directly. */
const stringify = (data: unknown) => JSON.stringify(data, (_k, v) => (v instanceof Uint8Array ? { $b64: toBase64(v) } : v));
const parse = (text: string) => JSON.parse(text, (_k, v) => (v && typeof v === 'object' && typeof v.$b64 === 'string' ? fromBase64(v.$b64) : v));

const KV_KEYS = ['settings', 'inkTools'];

export async function createBackup(): Promise<Blob> {
  const images = await db.images.toArray();
  const kvRows = await db.kv.bulkGet(KV_KEYS);
  const data: BackupData = {
    format: FORMAT,
    version: FORMAT_VERSION,
    schema: SCHEMA_VERSION,
    exportedAt: Date.now(),
    highlights: await db.highlights.toArray(),
    notes: await db.notes.toArray(),
    notebooks: await db.notebooks.toArray(),
    pages: await db.pages.toArray(),
    pageObjects: await db.pageObjects.toArray(),
    bookmarks: await db.bookmarks.toArray(),
    history: await db.history.toArray(),
    settings: Object.fromEntries(kvRows.filter(Boolean).map((r) => [r!.key, r!.value])),
    images: images.map((i) => ({ id: i.id, file: `images/${i.id}`, type: i.blob.type, createdAt: i.createdAt })),
  };
  const zip: Zippable = { 'backup.json': strToU8(stringify(data)) };
  for (const i of images) {
    // Images are already compressed, so store them as they are.
    zip[`images/${i.id}`] = [new Uint8Array(await i.blob.arrayBuffer()), { level: 0 }];
  }
  await db.kv.put({ key: 'lastBackupAt', value: Date.now() });
  return new Blob([zipSync(zip, { level: 6 }) as BlobPart], { type: 'application/zip' });
}

export interface ParsedBackup {
  data: BackupData;
  images: ImageRow[];
}

/** Reads a backup zip, or a bare backup.json. Throws a readable error on anything else. */
export async function readBackup(file: Blob): Promise<ParsedBackup> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let json: string;
  let files: Record<string, Uint8Array> = {};
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    try {
      files = unzipSync(bytes);
    } catch {
      throw new Error('This zip file is damaged and could not be opened.');
    }
    if (!files['backup.json']) throw new Error('This zip is not a Bible Notes backup. It has no backup.json inside.');
    json = strFromU8(files['backup.json']);
  } else {
    json = strFromU8(bytes);
  }
  let data: BackupData;
  try {
    data = parse(json);
  } catch {
    throw new Error('This file is not a Bible Notes backup. It could not be read as JSON.');
  }
  if (data?.format !== FORMAT) throw new Error('This file is not a Bible Notes backup.');
  if (data.version > FORMAT_VERSION) throw new Error('This backup comes from a newer version of Bible Notes. Update the app, then try again.');
  const images: ImageRow[] = (data.images ?? []).flatMap((i) => {
    const b = files[i.file];
    return b ? [{ id: i.id, createdAt: i.createdAt, blob: new Blob([b as BlobPart], { type: i.type }) }] : [];
  });
  return { data, images };
}

export interface RestoreSummary {
  notes: number;
  pages: number;
  highlights: number;
}

const ALL_TABLES = () => [db.highlights, db.notes, db.notebooks, db.pages, db.pageObjects, db.images, db.bookmarks, db.history, db.kv];

/** Replace: this device becomes exactly what's in the backup. */
export async function restoreReplace({ data, images }: ParsedBackup): Promise<RestoreSummary> {
  await db.transaction('rw', ALL_TABLES(), async () => {
    const lastBackup = await db.kv.get('lastBackupAt');
    await Promise.all(ALL_TABLES().map((t) => t.clear()));
    await db.highlights.bulkPut(data.highlights);
    await db.notes.bulkPut(data.notes);
    await db.notebooks.bulkPut(data.notebooks);
    await db.pages.bulkPut(data.pages);
    await db.pageObjects.bulkPut(data.pageObjects);
    await db.bookmarks.bulkPut(data.bookmarks);
    await db.history.bulkPut(data.history);
    await db.images.bulkPut(images);
    await db.kv.bulkPut(Object.entries(data.settings ?? {}).map(([key, value]) => ({ key, value })));
    if (lastBackup) await db.kv.put(lastBackup);
  });
  return { notes: data.notes.length, pages: data.pages.length, highlights: data.highlights.length };
}

async function mergeByUpdatedAt<T extends { id: string; updatedAt: number }>(table: Table<any, string, any>, rows: T[]): Promise<T[]> {
  const existing: (T | undefined)[] = await table.bulkGet(rows.map((r) => r.id));
  const newer = rows.filter((r, i) => !existing[i] || existing[i]!.updatedAt < r.updatedAt);
  await table.bulkPut(newer);
  return newer;
}

/**
 * Merge: anything new is added. When both sides have the same item the most recently edited one wins,
 * so restoring an old backup can't overwrite newer work. A page's strokes travel with the page, so a
 * page never ends up as a mix of two versions.
 */
export async function restoreMerge({ data, images }: ParsedBackup): Promise<RestoreSummary> {
  const summary = { notes: 0, pages: 0, highlights: 0 };
  await db.transaction('rw', ALL_TABLES(), async () => {
    summary.highlights = (await mergeByUpdatedAt(db.highlights, data.highlights)).length;
    summary.notes = (await mergeByUpdatedAt(db.notes, data.notes)).length;
    await mergeByUpdatedAt(db.notebooks, data.notebooks);
    const newerPages = await mergeByUpdatedAt(db.pages, data.pages);
    summary.pages = newerPages.length;
    for (const page of newerPages) {
      await db.pageObjects.where('pageId').equals(page.id).delete();
      await db.pageObjects.bulkPut(data.pageObjects.filter((o) => o.pageId === page.id));
    }
    const refs = new Set((await db.bookmarks.toArray()).map((b) => b.ref));
    await db.bookmarks.bulkPut(data.bookmarks.filter((b) => !refs.has(b.ref)));
    const history = await db.history.bulkGet(data.history.map((h) => h.chapterKey));
    await db.history.bulkPut(data.history.filter((h, i) => !history[i] || history[i]!.visitedAt < h.visitedAt));
    const known = await db.images.bulkGet(images.map((i) => i.id));
    await db.images.bulkPut(images.filter((_i, n) => !known[n]));
  });
  return summary;
}

export const lastBackupAt = async (): Promise<number | null> => ((await db.kv.get('lastBackupAt'))?.value as number | undefined) ?? null;

export const hasAnyWork = async (): Promise<boolean> => (await db.notes.count()) + (await db.pages.count()) + (await db.highlights.count()) > 0;
