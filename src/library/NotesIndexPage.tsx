import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { PageShell } from '../app/PageShell.tsx';
import { navigate } from '../app/router.ts';
import { BOOKS } from '../bible/books.ts';
import { db } from '../db/schema.ts';
import { updatePage } from '../db/library.ts';
import { updateNote } from '../db/study.ts';
import { Icon } from '../ui/icons.tsx';
import { allTags, buildIndex, filterIndex, groupByBook, type EntryKind, type IndexEntry } from './index.ts';
import { TagEditor } from './TagEditor.tsx';
import { openPage } from './openPage.ts';

const KINDS: { value: EntryKind; label: string; icon: string }[] = [
  { value: 'typed', label: 'Typed notes', icon: 'note' },
  { value: 'ink', label: 'Handwritten notes', icon: 'pen' },
  { value: 'page', label: 'Pages', icon: 'paper' },
  { value: 'bookmark', label: 'Bookmarks', icon: 'bookmark' },
  { value: 'highlight', label: 'Highlights', icon: 'highlight' },
];

function open(e: IndexEntry) {
  if (e.pageId) {
    void openPage(e.pageId);
  } else if (e.book && e.chapter) {
    navigate({ name: 'read', book: e.book, chapter: e.chapter, verse: e.verse, ...(e.noteId ? { noteId: e.noteId } : {}) });
  }
}

export function NotesIndexPage() {
  const data = useLiveQuery(async () => ({
    notes: await db.notes.toArray(),
    pages: await db.pages.toArray(),
    bookmarks: await db.bookmarks.toArray(),
    highlights: await db.highlights.toArray(),
  }), []);
  const [kinds, setKinds] = useState<EntryKind[]>(['typed', 'ink', 'page']);
  const [book, setBook] = useState('');
  const [tag, setTag] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);

  const entries = useMemo(() => (data ? buildIndex(data.notes, data.pages, data.bookmarks, data.highlights) : []), [data]);
  const shown = useMemo(() => filterIndex(entries, { kinds, book: book || undefined, tag: tag || undefined, query }), [entries, kinds, book, tag, query]);
  const groups = useMemo(() => groupByBook(shown), [shown]);
  const tags = useMemo(() => allTags(entries), [entries]);
  const books = useMemo(() => BOOKS.filter((b) => entries.some((e) => e.book === b.id)), [entries]);

  const toggleKind = (k: EntryKind) => setKinds(kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k]);
  const saveTags = (e: IndexEntry, t: string[]) => {
    if (e.noteId) void updateNote(e.noteId, { tags: t });
    else if (e.pageId) void updatePage(e.pageId, { tags: t });
  };

  return (
    <PageShell title="Notes index">
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your typed notes" aria-label="Search your notes" />
      <div className="filter-row" role="group" aria-label="Show">
        {KINDS.map((k) => (
          <button key={k.value} type="button" className={`chip chip-wide ${kinds.includes(k.value) ? 'is-active' : ''}`} aria-pressed={kinds.includes(k.value)} onClick={() => toggleKind(k.value)}>{k.label}</button>
        ))}
      </div>
      <div className="filter-row">
        <select value={book} onChange={(e) => setBook(e.target.value)} aria-label="Filter by book">
          <option value="">All books</option>
          {books.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        {tags.length > 0 && (
          <select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Filter by tag">
            <option value="">All tags</option>
            {tags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
      </div>
      {data && !shown.length && (
        <p className="muted empty-note">
          {entries.length ? 'Nothing matches these filters.' : 'Nothing here yet. Select a verse while reading, then add a note, or open a notebook page.'}
        </p>
      )}
      {groups.map((g) => (
        <section key={g.group} className="index-group">
          <h2>{g.group}</h2>
          <ul className="plain-list">
            {g.entries.map((e) => {
              const kind = KINDS.find((k) => k.value === e.kind)!;
              return (
                <li key={e.key} className="index-entry">
                  <button type="button" className="index-open" onClick={() => open(e)}>
                    <Icon name={kind.icon} size={20} aria-label={kind.label} />
                    <span className="index-text">
                      <span className="index-title">{e.title}</span>
                      {e.snippet && <span className="index-snippet">{e.snippet}</span>}
                    </span>
                  </button>
                  {(e.noteId || e.pageId) && (
                    <div className="index-tags">
                      {e.tags.map((t) => <span key={t} className="tag is-static">{t}</span>)}
                      <button type="button" className="link-btn" onClick={() => setEditing(editing === e.key ? null : e.key)}>{editing === e.key ? 'Done' : e.tags.length ? 'Edit tags' : 'Add tags'}</button>
                    </div>
                  )}
                  {editing === e.key && <TagEditor tags={e.tags} onChange={(t) => saveTags(e, t)} />}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </PageShell>
  );
}
