import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSettings } from '../app/settings.ts';
import { updateNote } from '../db/study.ts';
import type { Note } from '../db/schema.ts';
import type { PageDocument } from '../ink/document.ts';
import { InkEngine } from '../ink/engine.ts';
import { InkToolbar } from '../ink/InkToolbar.tsx';
import { selectToolConfig, useInkTools } from '../ink/toolStore.ts';
import { attachAutosave, loadDocument } from './pageStore.ts';

const DEFAULT_HEIGHT = 240;
const GROW_BY = 160;

/** A small ink area under a verse. The Pencil draws, and a finger still scrolls the Bible text. */
export function InlineInk({ note }: { note: Note }) {
  const host = useRef<HTMLDivElement>(null);
  const engineRef = useRef<InkEngine | null>(null);
  const docRef = useRef<PageDocument | null>(null);
  const [, setTick] = useState(0);
  const theme = useSettings((s) => s.theme);
  const tool = useInkTools(useShallow(selectToolConfig));
  const height = (note.content as { h?: number } | undefined)?.h ?? DEFAULT_HEIGHT;
  const paperColor = theme === 'dark' ? 'dark' as const : 'white' as const;

  useEffect(() => {
    if (!note.pageId) return;
    let cancelled = false;
    let stop: (() => void) | null = null;
    void loadDocument(note.pageId).then((doc) => {
      if (cancelled || !host.current) return;
      docRef.current = doc;
      stop = attachAutosave(note.pageId!, doc);
      const e = new InkEngine(host.current, doc, { template: 'blank', paperColor, sheets: 4 }, {
        embedded: true,
        onHistory: () => setTick((t) => t + 1),
      });
      e.setTool(selectToolConfig(useInkTools.getState()));
      engineRef.current = e;
      setTick((t) => t + 1);
    });
    return () => {
      cancelled = true;
      stop?.();
      engineRef.current?.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.pageId]);

  useEffect(() => { engineRef.current?.setTool(tool); }, [tool]);
  useEffect(() => { engineRef.current?.setMeta({ template: 'blank', paperColor, sheets: 4 }); }, [paperColor]);

  const doc = docRef.current;
  return (
    <div className="inline-ink">
      <InkToolbar compact canUndo={!!doc?.canUndo} canRedo={!!doc?.canRedo} onUndo={() => engineRef.current?.undo()} onRedo={() => engineRef.current?.redo()} />
      <div ref={host} style={{ height }} data-testid="inline-ink" />
      <button type="button" className="link-btn inline-ink-grow" onClick={() => void updateNote(note.id, { content: { h: height + GROW_BY } })}>Make this note taller</button>
    </div>
  );
}
