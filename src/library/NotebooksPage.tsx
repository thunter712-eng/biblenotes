import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { PageShell } from '../app/PageShell.tsx';
import { db, type Notebook, type Page } from '../db/schema.ts';
import { createNotebook, createPage, deleteNotebook, updateNotebook } from '../db/library.ts';
import { exportNotebookPdf, exportNotebookPngs } from '../backup/exportPage.ts';
import { PageMenu } from '../notebook/PageMenu.tsx';
import { PaperSettings } from '../notebook/PaperSettings.tsx';
import { Icon } from '../ui/icons.tsx';
import { IconButton, Sheet, toast } from '../ui/primitives.tsx';
import { TagEditor } from './TagEditor.tsx';
import { openPage } from './openPage.ts';

function NotebookSettings({ nb, onClose }: { nb: Notebook; onClose: () => void }) {
  const remove = async () => {
    onClose();
    const undo = await deleteNotebook(nb.id);
    toast(`Deleted "${nb.title}" and its pages`, { label: 'Undo', run: () => void undo() });
  };
  const run = async (fn: () => Promise<unknown>) => {
    try {
      toast('Preparing export');
      await fn();
    } catch (e) {
      toast((e as Error).message || 'The export failed. Try a smaller notebook.');
    }
  };
  return (
    <Sheet title={nb.title} onClose={onClose} width={460}>
      <div className="form-stack">
        <label className="field">
          <span className="field-label">Name</span>
          <input type="text" defaultValue={nb.title} aria-label="Notebook name" onBlur={(e) => void updateNotebook(nb.id, { title: e.target.value.trim() || nb.title })} />
        </label>
        <div className="field">
          <span className="field-label">Tags</span>
          <TagEditor tags={nb.tags} onChange={(tags) => void updateNotebook(nb.id, { tags })} />
        </div>
        <div className="menu-list">
          <button type="button" className="list-row" onClick={() => void run(() => exportNotebookPdf(nb))}><Icon name="share" size={20} />Export notebook as PDF</button>
          <button type="button" className="list-row" onClick={() => void run(() => exportNotebookPngs(nb))}><Icon name="image" size={20} />Export notebook as PNG images</button>
          <button type="button" className="list-row danger" onClick={() => void remove()}><Icon name="trash" size={20} />Delete notebook</button>
        </div>
      </div>
    </Sheet>
  );
}

export function NotebooksPage() {
  const notebooks = useLiveQuery(() => db.notebooks.orderBy('title').toArray(), []);
  const pages = useLiveQuery(() => db.pages.orderBy('updatedAt').reverse().toArray(), []);
  const [name, setName] = useState('');
  const [settingsFor, setSettingsFor] = useState<Notebook | null>(null);
  const [menuFor, setMenuFor] = useState<Page | null>(null);
  const [paperForId, setPaperForId] = useState<string | null>(null);
  // Looked up live, so the sheet's controls reflect each change as it's made.
  const paperFor = pages?.find((p) => p.id === paperForId);

  const add = () => {
    if (!name.trim()) return;
    void createNotebook(name);
    setName('');
  };
  const newPage = async (nb: Notebook) => {
    const p = await createPage({ notebookId: nb.id, title: 'Untitled page' });
    void openPage(p.id);
  };

  return (
    <PageShell title="Notebooks">
      <form className="goto" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="New notebook, such as Sermon notes" aria-label="New notebook name" />
        <button type="submit" className="btn">Add</button>
      </form>
      {notebooks && !notebooks.length && <p className="muted empty-note">Notebooks group your pages. Add one above, or open a notebook page while reading and one is made for you.</p>}
      {notebooks?.map((nb) => {
        const list = pages?.filter((p) => p.notebookId === nb.id) ?? [];
        return (
          <section key={nb.id} className="index-group">
            <div className="notebook-row">
              <h2>{nb.title}</h2>
              {nb.tags.map((t) => <span key={t} className="tag is-static">{t}</span>)}
              <span className="notebook-row-actions">
                <IconButton icon="plus" label={`New page in ${nb.title}`} onClick={() => void newPage(nb)} />
                <IconButton icon="more" label={`${nb.title} settings`} onClick={() => setSettingsFor(nb)} />
              </span>
            </div>
            {!list.length && <p className="muted">No pages yet.</p>}
            <ul className="plain-list">
              {list.map((p) => (
                <li key={p.id} className="page-row">
                  <button type="button" className="list-row" onClick={() => void openPage(p.id)}><Icon name="paper" size={20} />{p.title}</button>
                  <IconButton icon="paper" label={`Settings for ${p.title}`} onClick={() => setPaperForId(p.id)} />
                  <IconButton icon="more" label={`Actions for ${p.title}`} onClick={() => setMenuFor(p)} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {settingsFor && <NotebookSettings nb={settingsFor} onClose={() => setSettingsFor(null)} />}
      {menuFor && <PageMenu page={menuFor} onClose={() => setMenuFor(null)} onPageId={() => {}} />}
      {paperFor && <PaperSettings page={paperFor} onClose={() => setPaperForId(null)} />}
    </PageShell>
  );
}
