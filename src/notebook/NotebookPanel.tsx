import { forwardRef, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRef } from 'react';
import { db } from '../db/schema.ts';
import { IconButton } from '../ui/primitives.tsx';
import { createPage, pagesForChapter } from '../db/library.ts';
import { chapterKey } from '../bible/refs.ts';
import { NotebookCanvas, type NotebookHandle } from './NotebookCanvas.tsx';
import { PagePicker } from './PagePicker.tsx';
import { PaperSettings } from './PaperSettings.tsx';
import { PageMenu } from './PageMenu.tsx';

export interface PassageInfo {
  label: string;
  startRef: string;
  endRef: string;
  book: string;
  chapter: number;
}

export const NotebookPanel = forwardRef<NotebookHandle, {
  pageId: string | null;
  onPageId: (id: string | null) => void;
  passage: PassageInfo;
  fullscreen: boolean;
  onFullscreen: () => void;
  onClose: () => void;
}>(function NotebookPanel({ pageId, onPageId, passage, fullscreen, onFullscreen, onClose }, ref) {
  const [sheet, setSheet] = useState<null | 'pick' | 'paper' | 'menu'>(null);
  const page = useLiveQuery(() => (pageId ? db.pages.get(pageId) : undefined), [pageId]);
  const here = useLiveQuery(() => pagesForChapter(passage.book, passage.chapter), [passage.book, passage.chapter]);
  const checked = useRef<string | null>(null);

  // With nothing open, prefer a page already tied to this chapter.
  useEffect(() => {
    const key = chapterKey(passage.book, passage.chapter);
    if (pageId || !here || checked.current === key) return;
    checked.current = key;
    if (here[0]) onPageId(here[0].id);
  }, [pageId, here, passage.book, passage.chapter, onPageId]);

  const startPage = async () => {
    const p = await createPage({ startRef: passage.startRef, endRef: passage.endRef, title: passage.label });
    onPageId(p.id);
  };

  return (
    <div className="notebook-panel">
      <header className="notebook-head">
        <button type="button" className="page-title-btn" onClick={() => setSheet('pick')} aria-label="Choose a page">
          {page ? page.title : 'Notebook'}
        </button>
        <span className="notebook-head-actions">
          {page && <IconButton icon="paper" label="Page settings" onClick={() => setSheet('paper')} />}
          {page && <IconButton icon="more" label="Page actions" onClick={() => setSheet('menu')} />}
          <IconButton icon={fullscreen ? 'shrink' : 'expand'} label={fullscreen ? 'Show Scripture beside the page' : 'Full-screen notebook'} onClick={onFullscreen} />
          <IconButton icon="close" label="Close notebook" onClick={onClose} />
        </span>
      </header>
      {page ? (
        <NotebookCanvas key={page.id} ref={ref} page={page} />
      ) : (
        <div className="notebook-empty">
          <p>No page open for {passage.label}.</p>
          <button type="button" className="btn" onClick={() => void startPage()}>New page for {passage.label}</button>
          <button type="button" className="btn btn-quiet" onClick={() => setSheet('pick')}>Open another page</button>
        </div>
      )}
      {sheet === 'pick' && <PagePicker currentId={pageId} passage={passage} onClose={() => setSheet(null)} onPick={(id) => { onPageId(id); setSheet(null); }} />}
      {sheet === 'paper' && page && <PaperSettings page={page} onClose={() => setSheet(null)} />}
      {sheet === 'menu' && page && <PageMenu page={page} onClose={() => setSheet(null)} onPageId={onPageId} />}
    </div>
  );
});
