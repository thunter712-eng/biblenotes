import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { navigate, routeToHash, type Route } from '../app/router.ts';
import { rememberReadHash } from '../app/PageShell.tsx';
import { useSettings } from '../app/settings.ts';
import { getBook } from '../bible/books.ts';
import { adjacentChapter, chapterKey, makeRef, refKey } from '../bible/refs.ts';
import { db } from '../db/schema.ts';
import { newId } from '../app/ids.ts';
import { IconButton, toast } from '../ui/primitives.tsx';
import { Picker } from './Picker.tsx';
import { ReaderPane } from './ReaderPane.tsx';
import { ReadingSettings, useTranslations } from './ReadingSettings.tsx';

type ReadRoute = Extract<Route, { name: 'read' }>;

export function StudyView({ route }: { route: ReadRoute }) {
  const { book, chapter, verse } = route;
  const s = useSettings();
  const translations = useTranslations();
  const [sheet, setSheet] = useState<null | 'picker' | 'reading'>(null);
  const info = getBook(book);
  const chapterStart = makeRef(book, chapter, 0);
  const chapterEnd = makeRef(book, chapter, 999);
  const bookmarks = useLiveQuery(
    () => db.bookmarks.where('startKey').between(refKey(chapterStart), refKey(chapterEnd), true, true).toArray(),
    [chapterStart, chapterEnd],
  );

  useEffect(() => {
    rememberReadHash(routeToHash(route));
    void db.kv.put({ key: 'lastPosition', value: { book, chapter, ...(verse ? { verse } : {}) } });
    void db.history.put({ chapterKey: chapterKey(book, chapter), visitedAt: Date.now() });
  }, [book, chapter, verse, route]);

  const go = (delta: 1 | -1) => {
    const next = adjacentChapter(book, chapter, delta);
    if (next) navigate({ name: 'read', ...next });
  };

  const chapterBookmark = bookmarks?.find((b) => b.ref === makeRef(book, chapter, 1));
  const toggleBookmark = () => {
    if (chapterBookmark) {
      void db.bookmarks.delete(chapterBookmark.id);
      toast('Bookmark removed');
    } else {
      const ref = makeRef(book, chapter, 1);
      void db.bookmarks.add({ id: newId(), ref, startKey: refKey(ref), createdAt: Date.now() });
      toast('Bookmarked');
    }
  };

  const prev = adjacentChapter(book, chapter, -1);
  const next = adjacentChapter(book, chapter, 1);

  return (
    <div className="study">
      <header className="topbar">
        <div className="topbar-group">
          <IconButton icon="back" label="Previous chapter" disabled={!prev} onClick={() => go(-1)} />
          <button type="button" className="ref-btn" onClick={() => setSheet('picker')} aria-label={`${info?.name} ${chapter}. Choose a passage`}>
            {info?.name} {chapter}
          </button>
          <IconButton icon="forward" label="Next chapter" disabled={!next} onClick={() => go(1)} />
          <select className="translation-select" value={s.translation} aria-label="Translation" onChange={(e) => s.set({ translation: e.target.value })}>
            {translations.map((t) => <option key={t.id} value={t.id}>{t.abbr}</option>)}
          </select>
        </div>
        <div className="topbar-group">
          <IconButton icon="search" label="Search the Bible" onClick={() => navigate({ name: 'search' })} />
          <IconButton icon="type" label="Reading settings" onClick={() => setSheet('reading')} />
          <IconButton icon="bookmark" label={chapterBookmark ? 'Remove bookmark' : 'Bookmark this chapter'} active={!!chapterBookmark} onClick={toggleBookmark} />
          <IconButton icon="info" label="About" onClick={() => navigate({ name: 'about' })} />
        </div>
      </header>
      <div className="study-body">
        {chapterBookmark && <div className="ribbon" aria-hidden="true" />}
        <ReaderPane book={book} chapter={chapter} verse={verse} noteId={route.noteId} />
      </div>
      {sheet === 'picker' && <Picker currentBook={book} currentChapter={chapter} onClose={() => setSheet(null)} />}
      {sheet === 'reading' && <ReadingSettings onClose={() => setSheet(null)} />}
    </div>
  );
}
