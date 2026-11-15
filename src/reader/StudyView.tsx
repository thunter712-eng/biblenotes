import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { navigate, routeToHash, type Route } from '../app/router.ts';
import { rememberReadHash } from '../app/PageShell.tsx';
import { useSettings } from '../app/settings.ts';
import { getVerseTexts } from '../bible/data.ts';
import { adjacentChapter, chapterKey, chapterLabel, formatRange, formatVerses, makeRef, parseVerseRef, refKey } from '../bible/refs.ts';
import { toRuns } from '../bible/refs.ts';
import { db, type Note } from '../db/schema.ts';
import { createPage } from '../db/library.ts';
import { createNote, toggleBookmark, updateNote } from '../db/study.ts';
import { InlineInk } from '../notebook/InlineInk.tsx';
import { NotebookPanel, type PassageInfo } from '../notebook/NotebookPanel.tsx';
import type { NotebookHandle } from '../notebook/NotebookCanvas.tsx';
import { useInkTools } from '../ink/toolStore.ts';
import { Icon } from '../ui/icons.tsx';
import { IconButton, Popover, toast } from '../ui/primitives.tsx';
import { Picker } from './Picker.tsx';
import type { QuotePayload } from './quoteClipboard.ts';
import { ReaderPane } from './ReaderPane.tsx';
import { ReadingSettings, useTranslations } from './ReadingSettings.tsx';
import { useSelection } from './selection.ts';

type ReadRoute = Extract<Route, { name: 'read' }>;
export type StudyMode = 'read' | 'read-full' | 'split' | 'notebook';

const LAYOUTS: { mode: StudyMode; icon: string; label: string }[] = [
  { mode: 'read', icon: 'read', label: 'Scripture only' },
  { mode: 'split', icon: 'split', label: 'Scripture and notebook' },
  { mode: 'notebook', icon: 'page', label: 'Notebook only' },
  { mode: 'read-full', icon: 'expand', label: 'Full-screen reading' },
];

const MIN_RATIO = 0.22;
const MAX_RATIO = 0.78;

export function StudyView({ route }: { route: ReadRoute }) {
  const { book, chapter, verse } = route;
  const s = useSettings();
  const translations = useTranslations();
  const [sheet, setSheet] = useState<null | 'picker' | 'reading'>(null);
  const [pop, setPop] = useState<null | { kind: 'menu' | 'ribbon'; anchor: HTMLElement }>(null);
  const allBookmarks = useLiveQuery(() => db.bookmarks.orderBy('createdAt').reverse().toArray(), []);
  const [mode, setMode] = useState<StudyMode>(route.pageId ? 'split' : 'read');
  const [pageId, setPageIdState] = useState<string | null>(route.pageId ?? null);
  const [ratio, setRatio] = useState(s.splitRatio);
  const [ghost, setGhost] = useState<{ x: number; y: number; label: string; text: string; over: boolean } | null>(null);
  const [openedNote, setOpenedNote] = useState<string | null>(null);
  const notebook = useRef<NotebookHandle>(null);
  const splitEl = useRef<HTMLDivElement>(null);
  const dragPayload = useRef<QuotePayload | null>(null);
  const abbr = translations.find((t) => t.id === s.translation)?.abbr ?? s.translation.toUpperCase();
  const sel = useSelection();

  const chapterRef = makeRef(book, chapter, 1);
  const bookmarks = useLiveQuery(
    () => db.bookmarks.where('startKey').between(refKey(makeRef(book, chapter, 0)), refKey(makeRef(book, chapter, 999)), true, true).toArray(),
    [book, chapter],
  );

  // A deep link to a page opens it beside the text.
  useEffect(() => {
    if (route.pageId) {
      setPageIdState(route.pageId);
      setMode((m) => (m === 'read' || m === 'read-full' ? 'split' : m));
    }
  }, [route.pageId]);

  useEffect(() => { void useInkTools.getState().load(); }, []);

  // Moving to another chapter closes a page tied to a different passage, so the notebook follows the reading:
  // it then opens this chapter's page, or offers to start one. Topic pages, tied to no passage, stay open.
  const shownChapter = useRef(chapterKey(book, chapter));
  useEffect(() => {
    const key = chapterKey(book, chapter);
    if (shownChapter.current === key) return;
    shownChapter.current = key;
    if (!pageId || route.pageId === pageId) return;
    const low = refKey(makeRef(book, chapter, 0));
    const high = refKey(makeRef(book, chapter, 999));
    void db.pages.get(pageId).then((p) => {
      if (p && p.startKey && (p.startKey < low || p.startKey > high)) setPageIdState((cur) => (cur === pageId ? null : cur));
    });
    // Only a change of chapter should run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, chapter]);

  useEffect(() => {
    rememberReadHash(routeToHash(route));
    void db.kv.put({ key: 'lastPosition', value: { book, chapter, ...(verse ? { at: verse } : {}) } });
    void db.history.put({ chapterKey: chapterKey(book, chapter), visitedAt: Date.now() });
  }, [book, chapter, verse, route]);

  const setPageId = useCallback((id: string | null) => {
    setPageIdState(id);
    if (id) void db.kv.put({ key: 'lastPageId', value: id });
  }, []);

  const go = (delta: 1 | -1) => {
    const next = adjacentChapter(book, chapter, delta);
    if (next) navigate({ name: 'read', ...next });
  };

  const chapterBookmark = bookmarks?.find((b) => b.ref === chapterRef);
  const bookmarkChapter = async () => {
    const on = await toggleBookmark(chapterRef);
    toast(on ? `Bookmarked ${chapterLabel(book, chapter)}` : 'Bookmark removed');
  };

  const prev = adjacentChapter(book, chapter, -1);
  const next = adjacentChapter(book, chapter, 1);

  const passage: PassageInfo = (() => {
    const v = sel.verses;
    if (v.length) {
      const runs = toRuns(v);
      const startRef = makeRef(book, chapter, runs[0][0]);
      const endRef = makeRef(book, chapter, runs[runs.length - 1][1]);
      return { label: formatRange(startRef, endRef), startRef, endRef, book, chapter };
    }
    return { label: chapterLabel(book, chapter), startRef: makeRef(book, chapter, 1), endRef: makeRef(book, chapter, 1), book, chapter };
  })();

  const notebookOpen = mode === 'split' || mode === 'notebook';

  const currentQuote = async (): Promise<QuotePayload | null> => {
    const st = useSelection.getState();
    if (!st.verses.length) return null;
    const text = await getVerseTexts(s.translation, book, chapter, st.verses);
    return { book, chapter, verses: [...st.verses], translation: s.translation, abbr, text };
  };

  const addToPage = async () => {
    const q = await currentQuote();
    if (q) {
      notebook.current?.addQuote(q);
      useSelection.getState().clear();
    }
  };

  const overNotebook = (x: number, y: number) => !!document.elementFromPoint(x, y)?.closest('[data-page-drop]');

  const inkNote = async () => {
    const st = useSelection.getState();
    if (!st.verses.length) return;
    const note = await createNote('inline-ink', book, chapter, st.verses);
    const page = await createPage({ noteId: note.id, startRef: note.anchorStartRef, endRef: note.anchorEndRef, title: formatRange(note.anchorStartRef, note.anchorEndRef) });
    await updateNote(note.id, { pageId: page.id });
    st.clear();
    setOpenedNote(note.id);
  };

  // Divider drag. The ratio only goes to settings on release.
  const dividerDrag = useRef(false);
  const onDividerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dividerDrag.current = true;
  };
  const onDividerMove = (e: React.PointerEvent) => {
    if (!dividerDrag.current || !splitEl.current) return;
    const r = splitEl.current.getBoundingClientRect();
    const vertical = getComputedStyle(splitEl.current).flexDirection === 'column';
    const f = vertical ? (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width;
    setRatio(Math.max(MIN_RATIO, Math.min(MAX_RATIO, f)));
  };
  const onDividerUp = () => {
    if (!dividerDrag.current) return;
    dividerDrag.current = false;
    useSettings.getState().set({ splitRatio: ratio });
  };

  const readerVisible = mode !== 'notebook';
  const chromeHidden = mode === 'read-full';

  const renderInk = useCallback((note: Note) => <InlineInk note={note} />, []);

  return (
    <div className="study">
      {!chromeHidden && (
        <header className="topbar">
          <div className="topbar-group">
            <IconButton icon="back" label="Previous chapter" disabled={!prev} onClick={() => go(-1)} />
            <button type="button" className="ref-btn" onClick={() => setSheet('picker')} aria-label={`${chapterLabel(book, chapter)}. Choose a passage`}>
              {chapterLabel(book, chapter)}
            </button>
            <IconButton icon="forward" label="Next chapter" disabled={!next} onClick={() => go(1)} />
            <select className="translation-select" value={s.translation} aria-label="Translation" onChange={(e) => s.set({ translation: e.target.value })}>
              {translations.map((t) => <option key={t.id} value={t.id}>{t.abbr}</option>)}
            </select>
          </div>
          <div className="topbar-group">
            <IconButton icon="search" label="Search" onClick={() => navigate({ name: 'search' })} />
            <IconButton icon="type" label="Reading settings" onClick={() => setSheet('reading')} />
            <div className="layout-switch" role="group" aria-label="Layout">
              {LAYOUTS.map((l) => (
                <button key={l.mode} type="button" className={mode === l.mode ? 'is-active' : ''} aria-pressed={mode === l.mode} aria-label={l.label} title={l.label} onClick={() => setMode(l.mode)}>
                  <Icon name={l.icon} size={20} />
                </button>
              ))}
            </div>
            <IconButton icon="menu" label="Menu" onClick={(e) => setPop({ kind: 'menu', anchor: e.currentTarget })} />
          </div>
        </header>
      )}
      {chromeHidden && <IconButton className="flash-restore" icon="shrink" label="Leave full-screen reading" onClick={() => setMode('read')} />}
      <main className="study-split" ref={splitEl as React.RefObject<HTMLElement>}>
        {readerVisible && (
          <div className="split-reader" style={mode === 'split' ? { flex: `${ratio} 1 0` } : { flex: 1 }}>
            <button
              type="button" className={`ribbon-btn ${chapterBookmark ? 'is-marked' : ''}`}
              aria-label={chapterBookmark ? `Bookmarks. ${chapterLabel(book, chapter)} is bookmarked` : 'Bookmarks'}
              onClick={(e) => setPop({ kind: 'ribbon', anchor: e.currentTarget })}
            >
              <span className="ribbon" />
            </button>
            <ReaderPane
              book={book} chapter={chapter} verse={verse} at={route.at} noteId={route.noteId} openedNoteId={openedNote}
              onAddToPage={notebookOpen && pageId ? () => void addToPage() : undefined}
              onInkNote={() => void inkNote()}
              renderInk={renderInk}
              shouldQuoteDrag={() => notebookOpen && !!pageId}
              onQuoteMove={(x, y) => {
                if (!dragPayload.current) {
                  void currentQuote().then((q) => { dragPayload.current = q; });
                }
                const st = useSelection.getState();
                setGhost({ x, y, label: formatVerses(book, chapter, st.verses), text: dragPayload.current?.text ?? '', over: overNotebook(x, y) });
              }}
              onQuoteDrop={(x, y) => {
                const q = dragPayload.current;
                dragPayload.current = null;
                setGhost(null);
                if (q && overNotebook(x, y)) {
                  notebook.current?.addQuote(q, x, y);
                  useSelection.getState().clear();
                }
              }}
            />
          </div>
        )}
        {mode === 'split' && (
          <div className="divider" role="separator" aria-label="Resize Scripture and notebook" aria-orientation="vertical" onPointerDown={onDividerDown} onPointerMove={onDividerMove} onPointerUp={onDividerUp} onPointerCancel={onDividerUp}>
            <span className="divider-grip"><Icon name="grip" size={14} /></span>
          </div>
        )}
        {notebookOpen && (
          <div className={`split-notebook ${ghost?.over ? 'is-drop-target' : ''}`} style={mode === 'split' ? { flex: `${1 - ratio} 1 0` } : { flex: 1 }}>
            <NotebookPanel
              ref={notebook} pageId={pageId} onPageId={setPageId} passage={passage}
              fullscreen={mode === 'notebook'}
              onFullscreen={() => setMode(mode === 'notebook' ? 'split' : 'notebook')}
              onClose={() => setMode('read')}
            />
          </div>
        )}
      </main>
      {ghost && (
        <div className="quote-ghost" style={{ left: ghost.x, top: ghost.y }} aria-hidden="true">
          <strong>{ghost.label}</strong>
          <span>{ghost.text}</span>
        </div>
      )}
      {pop?.kind === 'menu' && (
        <Popover anchor={pop.anchor} label="Menu" onClose={() => setPop(null)}>
          <nav className="menu-list">
            <button type="button" className="list-row" data-closes onClick={() => navigate({ name: 'favorites' })}><Icon name="star" size={20} />Favorite verses</button>
            <button type="button" className="list-row" data-closes onClick={() => navigate({ name: 'notes' })}><Icon name="list" size={20} />Notes index</button>
            <button type="button" className="list-row" data-closes onClick={() => navigate({ name: 'notebooks' })}><Icon name="shelf" size={20} />Notebooks</button>
            <button type="button" className="list-row" data-closes onClick={() => navigate({ name: 'settings' })}><Icon name="settings" size={20} />Settings</button>
          </nav>
        </Popover>
      )}
      {pop?.kind === 'ribbon' && (
        <Popover anchor={pop.anchor} label="Bookmarks" onClose={() => setPop(null)}>
          <div className="menu-list ribbon-menu">
            <button type="button" className="list-row" data-closes onClick={() => void bookmarkChapter()}>
              <Icon name="bookmark" size={20} />{chapterBookmark ? `Remove the ribbon from ${chapterLabel(book, chapter)}` : `Bookmark ${chapterLabel(book, chapter)}`}
            </button>
            {!!allBookmarks?.length && <p className="popover-label">Your bookmarks</p>}
            {allBookmarks?.map((b) => {
              const p = parseVerseRef(b.ref);
              const here = p.book === book && p.chapter === chapter;
              return (
                <button key={b.id} type="button" className={`list-row ${here ? 'is-current' : ''}`} data-closes onClick={() => navigate({ name: 'read', book: p.book, chapter: p.chapter, ...(p.verse > 1 ? { verse: p.verse } : {}) })}>
                  <span className="ribbon-swatch" aria-hidden="true" />{p.verse > 1 ? formatRange(b.ref) : chapterLabel(p.book, p.chapter)}
                </button>
              );
            })}
          </div>
        </Popover>
      )}
      {sheet === 'picker' && <Picker currentBook={book} currentChapter={chapter} onClose={() => setSheet(null)} />}
      {sheet === 'reading' && <ReadingSettings onClose={() => setSheet(null)} />}
    </div>
  );
}
