import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Page, type PaperColor, type PaperTemplate } from '../db/schema.ts';
import { updatePage } from '../db/library.ts';
import { Field, Sheet } from '../ui/primitives.tsx';

const TEMPLATES: { value: PaperTemplate; label: string }[] = [
  { value: 'college', label: 'College ruled' },
  { value: 'wide', label: 'Wide ruled' },
  { value: 'grid', label: 'Grid' },
  { value: 'dot', label: 'Dot grid' },
  { value: 'blank', label: 'Blank' },
  { value: 'cornell', label: 'Cornell notes' },
];
const COLORS: { value: PaperColor; label: string }[] = [
  { value: 'white', label: 'White' },
  { value: 'cream', label: 'Cream' },
  { value: 'dark', label: 'Dark' },
];

export function PaperSettings({ page, onClose }: { page: Page; onClose: () => void }) {
  const notebooks = useLiveQuery(() => db.notebooks.orderBy('title').toArray(), []);
  return (
    <Sheet title="Page settings" onClose={onClose} width={480}>
      <div className="form-stack">
        <Field label="Title">
          <input type="text" defaultValue={page.title} onBlur={(e) => void updatePage(page.id, { title: e.target.value.trim() || page.title })} aria-label="Page title" />
        </Field>
        <Field label="Notebook">
          <select value={page.notebookId} onChange={(e) => void updatePage(page.id, { notebookId: e.target.value })}>
            {notebooks?.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}
          </select>
        </Field>
        <div className="field">
          <span className="field-label">Paper</span>
          <div className="book-grid">
            {TEMPLATES.map((t) => (
              <button key={t.value} type="button" className={`chip ${page.template === t.value ? 'is-active' : ''}`} onClick={() => void updatePage(page.id, { template: t.value })}>{t.label}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="field-label">Paper color</span>
          <div className="book-grid">
            {COLORS.map((c) => (
              <button key={c.value} type="button" className={`chip ${page.paperColor === c.value ? 'is-active' : ''}`} onClick={() => void updatePage(page.id, { paperColor: c.value })}>{c.label}</button>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
