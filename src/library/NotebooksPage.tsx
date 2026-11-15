import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { PageShell } from '../app/PageShell.tsx';
import { db, type CoverColor, type Notebook, type Page } from '../db/schema.ts';
import { createNotebook, createPage, deleteNotebook, updateNotebook } from '../db/library.ts';
import { exportNotebookPdf, exportNotebookPngs } from '../backup/exportPage.ts';
import { formatPageDate, todayIso } from '../ink/paper.ts';
import { PageMenu } from '../notebook/PageMenu.tsx';
import { PaperSettings } from '../notebook/PaperSettings.tsx';
import { Icon } from '../ui/icons.tsx';
import { IconButton, Sheet, toast } from '../ui/primitives.tsx';
import { TagEditor } from './TagEditor.tsx';
import { openPage } from './openPage.ts';
import { usePageThumb } from './pageThumbs.ts';

export const COVERS: { value: CoverColor; label: string }[] = [
  { value: 'lapis', label: 'Lapis' },
  { value: 'oxblood', label: 'Oxblood' },
  { value: 'forest', label: 'Forest' },
  { value: 'slate', label: 'Slate' },
  { value: 'ochre', label: 'Ochre' },
  { value: 'plum', label: 'Plum' },
];

const pageDay = (p: Page) => p.date || todayIso(new Date(p.createdAt));

/** New notebooks take the next cloth along, so a shelf of them isn't all one color. */
const coverFor = (nb: Notebook, i: number): CoverColor => nb.color ?? COVERS[i % COVERS.length].value;

function NotebookSettings({ nb, color, onClose }: { nb: Notebook; color: CoverColor; onClose: () => void }) {
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
          <span className="field-label">Cover</span>
          <div className="cover-swatches" role="radiogroup" aria-label="Cover color">
            {COVERS.map((c) => (
              <button key={c.value} type="button" role="radio" aria-checked={color === c.value} aria-label={c.label} className={`cover-swatch cloth-${c.value}`} onClick={() => void updateNotebook(nb.id, { color: c.value })} />
            ))}
          </div>
        </div>
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

function PageTile({ page, onPaper, onMenu }: { page: Page; onPaper: () => void; onMenu: () => void }) {
  const thumb = usePageThumb(page);
  const when = page.date ? formatPageDate(page.date) : new Date(page.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return (
    <li className="page-tile">
      <button type="button" className="list-row page-tile-open" onClick={() => void openPage(page.id)} aria-label={`Open ${page.title}, ${when}`}>
        <span className={`page-thumb paper-${page.paperColor}`}>{thumb && <img src={thumb} alt="" />}</span>
        <span className="page-tile-title">{page.title}</span>
        <span className="page-tile-date">{when}</span>
      </button>
      <span className="page-tile-actions">
        <IconButton icon="paper" size={20} label={`Settings for ${page.title}`} onClick={onPaper} />
        <IconButton icon="more" size={20} label={`Actions for ${page.title}`} onClick={onMenu} />
      </span>
    </li>
  );
}

/** Notebooks as cloth-bound covers on a shelf. Picking one shows its pages as previews of the real paper. */
export function NotebooksPage() {
  const notebooks = useLiveQuery(() => db.notebooks.orderBy('title').toArray(), []);
  const pages = useLiveQuery(() => db.pages.orderBy('updatedAt').reverse().toArray(), []);
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [settingsFor, setSettingsFor] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<Page | null>(null);
  const [paperForId, setPaperForId] = useState<string | null>(null);
  // Looked up live, so the sheet's controls reflect each change as it's made.
  const paperFor = pages?.find((p) => p.id === paperForId);

  // Without a choice, open the notebook written in most recently.
  const recent = pages?.find((p) => p.notebookId)?.notebookId;
  const openId = (chosen && notebooks?.some((n) => n.id === chosen) ? chosen : null) ?? recent ?? notebooks?.[0]?.id ?? null;
  const open = notebooks?.find((n) => n.id === openId);
  const openIndex = notebooks?.findIndex((n) => n.id === openId) ?? 0;
  // Oldest first, like a paper notebook, by the date written on each page. Undated pages use the day they were made.
  const list = pages?.filter((p) => p.notebookId === openId).sort((a, b) => pageDay(a).localeCompare(pageDay(b)) || a.createdAt - b.createdAt) ?? [];
  const settingsNb = notebooks?.find((n) => n.id === settingsFor);

  const add = async () => {
    if (!name.trim()) return;
    const nb = await createNotebook(name);
    setChosen(nb.id);
    setName('');
    setAdding(false);
  };
  const newPage = async (nb: Notebook) => {
    const p = await createPage({ notebookId: nb.id, title: 'Untitled page' });
    void openPage(p.id);
  };
  const pagesLabel = (n: number) => `${n} ${n === 1 ? 'page' : 'pages'}`;
  const count = (id: string) => pages?.filter((p) => p.notebookId === id).length ?? 0;

  return (
    <PageShell title="Notebooks">
      <div className="shelf" role="list" aria-label="Your notebooks">
        {notebooks?.map((nb, i) => (
          <div key={nb.id} role="listitem" className="shelf-slot">
            <button
              type="button" className={`cover cloth-${coverFor(nb, i)} ${nb.id === openId ? 'is-open' : ''}`}
              aria-pressed={nb.id === openId} aria-label={`${nb.title}, ${pagesLabel(count(nb.id))}`} onClick={() => setChosen(nb.id)}
            >
              <span className="cover-title">{nb.title}</span>
              <span className="cover-count">{pagesLabel(count(nb.id))}</span>
            </button>
          </div>
        ))}
        <div role="listitem" className="shelf-slot">
          {adding || (notebooks && !notebooks.length) ? (
            <form className="cover cover-new is-form" onSubmit={(e) => { e.preventDefault(); void add(); }}>
              <input type="text" value={name} autoFocus={adding} onChange={(e) => setName(e.target.value)} onBlur={() => { if (!name.trim()) setAdding(false); }} placeholder="Sermon notes" aria-label="New notebook name" />
              <button type="submit" className="btn">Add notebook</button>
            </form>
          ) : (
            <button type="button" className="cover cover-new" onClick={() => setAdding(true)}>
              <Icon name="plus" size={26} />
              <span>New notebook</span>
            </button>
          )}
        </div>
      </div>

      {notebooks && !notebooks.length && <p className="muted empty-note">Notebooks group your pages. Name your first one above, or open a notebook page while reading and one is made for you.</p>}

      {open && (
        <section className="shelf-open" aria-label={open.title}>
          <div className="notebook-row">
            <span className={`spine-dot cloth-${coverFor(open, openIndex)}`} aria-hidden="true" />
            <h2>{open.title}</h2>
            {open.tags.map((t) => <span key={t} className="tag is-static">{t}</span>)}
            <span className="notebook-row-actions">
              <button type="button" className="btn btn-quiet" onClick={() => void newPage(open)} aria-label={`New page in ${open.title}`}><Icon name="plus" size={18} />New page</button>
              <IconButton icon="more" label={`${open.title} settings`} onClick={() => setSettingsFor(open.id)} />
            </span>
          </div>
          {!list.length && (
            <div className="shelf-empty">
              <p className="muted">No pages in this notebook yet.</p>
              <button type="button" className="btn" onClick={() => void newPage(open)}>Start the first page</button>
            </div>
          )}
          <ul className="page-grid">
            {list.map((p) => <PageTile key={p.id} page={p} onPaper={() => setPaperForId(p.id)} onMenu={() => setMenuFor(p)} />)}
          </ul>
        </section>
      )}
      {settingsNb && <NotebookSettings nb={settingsNb} color={coverFor(settingsNb, notebooks!.indexOf(settingsNb))} onClose={() => setSettingsFor(null)} />}
      {menuFor && <PageMenu page={menuFor} onClose={() => setMenuFor(null)} onPageId={() => {}} />}
      {paperFor && <PaperSettings page={paperFor} onClose={() => setPaperForId(null)} />}
    </PageShell>
  );
}
