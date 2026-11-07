import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { formatRange } from '../bible/refs.ts';
import type { Note } from '../db/schema.ts';
import { deleteNote, updateNote } from '../db/study.ts';
import { RichEditor } from '../editor/RichEditor.tsx';
import { IconButton, toast } from '../ui/primitives.tsx';

function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let t = 0;
  let last: A | null = null;
  const run = (...a: A) => {
    last = a;
    clearTimeout(t);
    t = window.setTimeout(() => { last = null; fn(...a); }, ms);
  };
  run.flush = () => {
    if (last) { clearTimeout(t); const a = last; last = null; fn(...a); }
  };
  return run;
}

export function InlineNoteCard({ note, autoFocus, renderInk }: { note: Note; autoFocus?: boolean; renderInk?: (note: Note) => ReactNode }) {
  const save = useMemo(() => debounce((content: unknown, text: string) => void updateNote(note.id, { content, text }), 350), [note.id]);
  const flush = useRef(save.flush);
  flush.current = save.flush;
  useEffect(() => () => flush.current(), []);
  useEffect(() => {
    const onHide = () => flush.current();
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  const remove = useCallback(async () => {
    flush.current();
    const undo = await deleteNote(note.id);
    toast('Note deleted', { label: 'Undo', run: () => void undo() });
  }, [note.id]);

  return (
    <div className="inline-note" data-note={note.id}>
      <header className="inline-note-head">
        <span className="inline-note-ref">{formatRange(note.anchorStartRef, note.anchorEndRef)}</span>
        <span className="inline-note-actions">
          <IconButton icon="trash" size={18} label="Delete note" onClick={() => void remove()} />
          <IconButton icon="chevronDown" size={18} label="Collapse note" className="flip" onClick={() => void updateNote(note.id, { collapsed: true })} />
        </span>
      </header>
      {note.kind === 'inline-text' ? (
        <RichEditor content={note.content} autoFocus={autoFocus} placeholder="Write a note" onChange={(json, text) => save(json, text)} />
      ) : (
        renderInk?.(note)
      )}
    </div>
  );
}
