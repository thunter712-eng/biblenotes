import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { fontCss } from '../app/fonts.ts';
import { useSettings } from '../app/settings.ts';
import { getBook } from '../bible/books.ts';
import { chapterKey, makeRef, parseVerseRef } from '../bible/refs.ts';
import { db, type Note } from '../db/schema.ts';
import { updateNote } from '../db/study.ts';
import { ActionBar } from './ActionBar.tsx';
import { ChapterText, NO_DECOR, ParallelText, type VerseDecor } from './ChapterText.tsx';
import { InlineNoteCard } from './InlineNotes.tsx';
import { useTranslations } from './ReadingSettings.tsx';
import { applyDrag, applyTap, useSelection } from './selection.ts';
import { useChapter } from './useChapter.ts';
import { useVerseGestures } from './useVerseGestures.ts';

export interface ReaderPaneProps {
  book: string;
  chapter: number;
  verse?: number;
  /** Scroll here without calling attention to it: the restored reading position. */
  at?: number;
  noteId?: string;
  onAddToPage?: () => void;
  onInkNote?: () => void;
  shouldQuoteDrag?: () => boolean;
  onQuoteMove?: (x: number, y: number) => void;
  onQuoteDrop?: (x: number, y: number) => void;
  renderInk?: (note: Note) => ReactNode;
  openedNoteId?: string | null;
}

export function ReaderPane({ book, chapter, verse, at, noteId, onAddToPage, onInkNote, shouldQuoteDrag, onQuoteMove, onQuoteDrop, renderInk, openedNoteId }: ReaderPaneProps) {
  const s = useSettings();
  const translations = useTranslations();
  const main = useChapter(s.translation, book, chapter);
  const second = useChapter(s.parallelTranslation, book, chapter);
  const scroller = useRef<HTMLDivElement>(null);
  const article = useRef<HTMLElement>(null);
  const info = getBook(book);
  const key = chapterKey(book, chapter);
  const highlights = useLiveQuery(() => db.highlights.where('chapterKey').equals(key).toArray(), [key]);
  const notes = useLiveQuery(() => db.notes.where('chapterKey').equals(key).toArray(), [key]);
  const sel = useSelection();
  const [focusNote, setFocusNote] = useState<string | null>(null);

  useEffect(() => { useSelection.getState().clear(); }, [key, s.translation]);

  const known = useMemo(() => new Set(main.data?.verses.map((v) => v.number)), [main.data]);
  const dragBase = useRef<number[]>([]);

  useVerseGestures(article, {
    onTap: (v, additive) => {
      const st = useSelection.getState();
      if (st.wordVerse !== null) { st.setWordVerse(null); return; }
      st.setSelection(applyTap({ verses: st.verses, anchor: st.anchor }, v, additive || st.additive, known));
    },
    onTapEmpty: () => useSelection.getState().clear(),
    onDragSelect: (from, to, begin) => {
      const st = useSelection.getState();
      if (begin) dragBase.current = st.verses;
      st.setSelection(applyDrag(dragBase.current, from, to, known));
    },
    onDragEnd: () => {},
    onWordDrag: (v, a, b) => useSelection.getState().setWords({ verse: v, start: Math.min(a, b), end: Math.max(a, b) }),
    shouldQuoteDrag: (v) => !!shouldQuoteDrag?.() && useSelection.getState().verses.includes(v),
    onQuoteMove: (x, y) => onQuoteMove?.(x, y),
    onQuoteDrop: (x, y) => onQuoteDrop?.(x, y),
    onHapticStart: () => navigator.vibrate?.(8),
  });

  // Scroll on navigation: to the target verse or note when there is one, otherwise to the top.
  useEffect(() => {
    if (!main.data) return;
    const target = verse || at ? document.getElementById(`v-${s.translation}-${verse ?? at}`) : null;
    if (target && verse) {
      target.scrollIntoView({ block: 'center' });
      target.classList.remove('flash');
      void target.offsetWidth;
      target.classList.add('flash');
    } else if (target) {
      target.scrollIntoView({ block: 'start' });
    } else if (!noteId) {
      scroller.current?.scrollTo(0, 0);
    }
    // `at` only matters when a chapter first opens, so saving a new position mustn't scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [main.data, verse, s.translation, noteId, key]);

  // Remembers the verse at the top of the view, so the app reopens at the same place.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let timer = 0;
    const onScroll = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        const r = el.getBoundingClientRect();
        const under = document.elementFromPoint(r.left + r.width / 2, r.top + 40)?.closest('[data-v]') as HTMLElement | null;
        void db.kv.put({ key: 'lastPosition', value: { book, chapter, ...(under?.dataset.v ? { at: +under.dataset.v } : {}) } });
      }, 400);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      el.removeEventListener('scroll', onScroll);
    };
  }, [book, chapter]);

  useEffect(() => {
    if (!noteId) return;
    void updateNote(noteId, { collapsed: false }).then(() => {
      requestAnimationFrame(() => document.querySelector(`[data-note="${noteId}"]`)?.scrollIntoView({ block: 'center' }));
    });
  }, [noteId]);

  // A note that was just created or opened from elsewhere scrolls into view.
  useEffect(() => {
    if (!openedNoteId) return;
    requestAnimationFrame(() => document.querySelector(`[data-note="${openedNoteId}"]`)?.scrollIntoView({ block: 'center' }));
  }, [openedNoteId, notes?.length]);

  const decorMap = useMemo(() => {
    const map = new Map<number, VerseDecor>();
    const get = (v: number) => {
      let d = map.get(v);
      if (!d) { d = { ...NO_DECOR, highlights: [] }; map.set(v, d); }
      return d;
    };
    for (const h of highlights ?? []) get(parseVerseRef(h.startRef).verse).highlights.push(h);
    for (const n of notes ?? []) get(parseVerseRef(n.anchorStartRef).verse).hasNotes = true;
    for (const v of sel.verses) get(v).selected = true;
    if (sel.wordVerse !== null) {
      const d = get(sel.wordVerse);
      d.wordMode = true;
      d.words = sel.words;
    }
    return map;
  }, [highlights, notes, sel.verses, sel.wordVerse, sel.words]);
  const decorFor = useCallback((v: number) => decorMap.get(v) ?? NO_DECOR, [decorMap]);

  const openAfter = useMemo(() => {
    const map = new Map<number, Note[]>();
    for (const n of notes ?? []) {
      if (n.collapsed) continue;
      const v = parseVerseRef(n.anchorEndRef).verse;
      map.set(v, [...(map.get(v) ?? []), n]);
    }
    return map;
  }, [notes]);

  const hasAfter = useCallback((v: number) => openAfter.has(v), [openAfter]);
  const renderAfter = (v: number) => (
    <div className="after-verse">
      {openAfter.get(v)?.map((n) => <InlineNoteCard key={n.id} note={n} autoFocus={focusNote === n.id} renderInk={renderInk} />)}
    </div>
  );
  const onMarker = useCallback((v: number) => {
    const ref = makeRef(book, chapter, v);
    const here = (notes ?? []).filter((n) => n.anchorStartRef === ref);
    const anyOpen = here.some((n) => !n.collapsed);
    for (const n of here) void updateNote(n.id, { collapsed: anyOpen });
  }, [notes, book, chapter]);

  const parallel = s.parallel && s.parallelTranslation !== s.translation;
  const abbr = translations.find((t) => t.id === s.translation)?.abbr ?? s.translation.toUpperCase();
  const rightAbbr = translations.find((t) => t.id === s.parallelTranslation)?.abbr ?? '';

  return (
    <div className="reader-pane">
      <div className="reader-scroll" ref={scroller} data-testid="reader">
        <article ref={article} className={`reader ${parallel ? 'is-parallel' : ''}`} onKeyDown={(e) => {
          // Enter or Space on a focused verse acts as a tap, for keyboards and switch control.
          const v = (e.target as HTMLElement).dataset?.v;
          if (v && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            const st = useSelection.getState();
            st.setSelection(applyTap({ verses: st.verses, anchor: st.anchor }, +v, e.metaKey || e.ctrlKey || st.additive, known));
          }
        }} style={{ fontFamily: fontCss(s.readerFont), fontSize: s.readerSize, lineHeight: s.readerLeading }}>
          <h1 className="book-title">{info?.name}{parallel ? ` ${chapter}` : ''}</h1>
          {main.error && <p className="form-error">{main.error}</p>}
          {parallel && <div className="parallel-row parallel-head"><span>{abbr}</span><span>{rightAbbr}</span></div>}
          {main.data && (parallel && second.data ? (
            <ParallelText left={main.data} right={second.data} leftId={s.translation} rightId={s.parallelTranslation} showNumbers={s.showVerseNumbers} decorFor={decorFor} hasAfter={hasAfter} renderAfter={renderAfter} onMarker={onMarker} />
          ) : (
            <ChapterText data={main.data} chapter={chapter} translation={s.translation} showNumbers={s.showVerseNumbers} decorFor={decorFor} hasAfter={hasAfter} renderAfter={renderAfter} onMarker={onMarker} />
          ))}
        </article>
      </div>
      <ActionBar book={book} chapter={chapter} abbr={abbr} onNoteCreated={setFocusNote} onAddToPage={onAddToPage} onInkNote={onInkNote} />
    </div>
  );
}
