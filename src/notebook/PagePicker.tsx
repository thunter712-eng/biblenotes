import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../db/schema.ts';
import { createNotebook, createPage } from '../db/library.ts';
import { Field, Sheet } from '../ui/primitives.tsx';

/** Switches the panel to another page, or starts a new one. */
export function PagePicker({ currentId, onPick, onClose, passage }: {
  currentId: string | null;
  onPick: (id: string) => void;
  onClose: () => void;
  passage: { label: string; startRef: string; endRef: string };
}) {
  const notebooks = useLiveQuery(() => db.notebooks.orderBy('title').toArray(), []);
  const pages = useLiveQuery(() => db.pages.orderBy('updatedAt').reverse().toArray(), []);
  const [topic, setTopic] = useState('');
  const visible = pages?.filter((p) => p.notebookId);

  const newForPassage = async () => {
    const p = await createPage({ startRef: passage.startRef, endRef: passage.endRef, title: passage.label });
    onPick(p.id);
  };
  const newTopic = async () => {
    const p = await createPage({ title: topic.trim() || 'Untitled page' });
    onPick(p.id);
  };

  return (
    <Sheet title="Choose a page" onClose={onClose} width={560}>
      <div className="form-stack">
        <button type="button" className="btn" onClick={() => void newForPassage()}>New page for {passage.label}</button>
        <form className="goto" onSubmit={(e) => { e.preventDefault(); void newTopic(); }}>
          <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Or a study topic, such as Grace" aria-label="New page topic" />
          <button type="submit" className="btn btn-quiet">Add</button>
        </form>
        {notebooks?.map((nb) => {
          const list = visible?.filter((p) => p.notebookId === nb.id) ?? [];
          if (!list.length) return null;
          return (
            <section key={nb.id}>
              <h3 className="list-heading">{nb.title}</h3>
              <ul className="plain-list">
                {list.map((p) => (
                  <li key={p.id}>
                    <button type="button" className={`list-row ${p.id === currentId ? 'is-active' : ''}`} onClick={() => onPick(p.id)}>{p.title}</button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {!!notebooks?.length && (
          <Field label="New notebook" hint="Press return to add it. Move pages into it from page settings.">
            <input type="text" aria-label="New notebook name" placeholder="Romans study" onKeyDown={(e) => {
              if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                void createNotebook(e.currentTarget.value);
                e.currentTarget.value = '';
              }
            }} />
          </Field>
        )}
      </div>
    </Sheet>
  );
}
