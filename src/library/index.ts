import { getBook } from '../bible/books.ts';
import { formatRange, parseVerseRef } from '../bible/refs.ts';
import type { Bookmark, Highlight, Note, Page } from '../db/schema.ts';

export type EntryKind = 'typed' | 'ink' | 'page' | 'bookmark' | 'highlight';

export interface IndexEntry {
  key: string;
  kind: EntryKind;
  sortKey: number;
  /** Book name, or "Study topics" for a page with no passage. */
  group: string;
  title: string;
  snippet: string;
  tags: string[];
  book?: string;
  chapter?: number;
  verse?: number;
  noteId?: string;
  pageId?: string;
  updatedAt: number;
  searchText: string;
}

export const STUDY_TOPICS = 'Study topics';

const anchored = (ref: string) => {
  const a = parseVerseRef(ref);
  return { book: a.book, chapter: a.chapter, verse: a.verse, group: getBook(a.book)?.name ?? a.book };
};

/** Every note, page, bookmark and highlight as one list, in canonical order. Free-standing pages come last. */
export function buildIndex(notes: Note[], pages: Page[], bookmarks: Bookmark[], highlights: Highlight[] = []): IndexEntry[] {
  const out: IndexEntry[] = [];
  for (const n of notes) {
    const title = formatRange(n.anchorStartRef, n.anchorEndRef);
    out.push({
      key: `note-${n.id}`, kind: n.kind === 'inline-ink' ? 'ink' : 'typed', sortKey: n.startKey, ...anchored(n.anchorStartRef),
      title, snippet: n.kind === 'inline-ink' ? 'Handwritten note' : n.text, tags: n.tags, noteId: n.id, updatedAt: n.updatedAt,
      searchText: `${title} ${n.text} ${n.tags.join(' ')}`.toLowerCase(),
    });
  }
  for (const p of pages) {
    if (!p.notebookId) continue; // Hidden pages belong to inline-ink notes.
    const ref = p.anchorStartRef ? anchored(p.anchorStartRef) : { group: STUDY_TOPICS };
    out.push({
      key: `page-${p.id}`, kind: 'page', sortKey: p.startKey || Number.MAX_SAFE_INTEGER, ...ref,
      title: p.title, snippet: p.text, tags: p.tags, pageId: p.id, updatedAt: p.updatedAt,
      searchText: `${p.title} ${p.text} ${p.tags.join(' ')}`.toLowerCase(),
    });
  }
  for (const b of bookmarks) {
    const title = formatRange(b.ref);
    out.push({ key: `bm-${b.id}`, kind: 'bookmark', sortKey: b.startKey, ...anchored(b.ref), title, snippet: 'Bookmark', tags: [], updatedAt: b.createdAt, searchText: title.toLowerCase() });
  }
  for (const h of highlights) {
    const title = formatRange(h.startRef);
    out.push({
      key: `hl-${h.id}`, kind: 'highlight', sortKey: h.startKey, ...anchored(h.startRef), title,
      snippet: `${h.color} ${h.style === 'highlight' ? 'highlight' : h.style}${h.wordRange ? ' on words' : ''}`, tags: [], updatedAt: h.updatedAt, searchText: title.toLowerCase(),
    });
  }
  return out.sort((a, b) => a.sortKey - b.sortKey || b.updatedAt - a.updatedAt);
}

export interface IndexFilter {
  kinds?: EntryKind[];
  book?: string;
  tag?: string;
  query?: string;
}

export function filterIndex(entries: IndexEntry[], f: IndexFilter): IndexEntry[] {
  const words = f.query?.trim().toLowerCase().split(/\s+/).filter(Boolean) ?? [];
  return entries.filter((e) => {
    if (f.kinds?.length && !f.kinds.includes(e.kind)) return false;
    if (f.book && e.book !== f.book) return false;
    if (f.tag && !e.tags.includes(f.tag)) return false;
    return words.every((w) => e.searchText.includes(w));
  });
}

export function groupByBook(entries: IndexEntry[]): { group: string; entries: IndexEntry[] }[] {
  const groups: { group: string; entries: IndexEntry[] }[] = [];
  for (const e of entries) {
    const last = groups[groups.length - 1];
    if (last?.group === e.group) last.entries.push(e);
    else groups.push({ group: e.group, entries: [e] });
  }
  return groups;
}

export const allTags = (entries: IndexEntry[]): string[] => [...new Set(entries.flatMap((e) => e.tags))].sort();
