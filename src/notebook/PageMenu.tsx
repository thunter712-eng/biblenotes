import type { Page } from '../db/schema.ts';
import { deletePage, duplicatePage } from '../db/library.ts';
import { forgetDocument } from './pageStore.ts';
import { Icon } from '../ui/icons.tsx';
import { Sheet, toast } from '../ui/primitives.tsx';

export function PageMenu({ page, onClose, onPageId }: { page: Page; onClose: () => void; onPageId: (id: string | null) => void }) {
  const duplicate = async () => {
    const copy = await duplicatePage(page.id);
    if (copy) {
      onPageId(copy.id);
      toast('Page duplicated');
    }
    onClose();
  };
  const remove = async () => {
    onPageId(null);
    onClose();
    // Let the canvas unmount and save before the rows go.
    await new Promise((r) => setTimeout(r, 50));
    const undo = await deletePage(page.id);
    forgetDocument(page.id);
    toast(`Deleted "${page.title}"`, { label: 'Undo', run: () => { void undo().then(() => onPageId(page.id)); } });
  };
  return (
    <Sheet title={page.title} onClose={onClose} width={420}>
      <div className="menu-list">
        <button type="button" className="list-row" onClick={() => void duplicate()}><Icon name="duplicate" size={20} />Duplicate page</button>
        <button type="button" className="list-row danger" onClick={() => void remove()}><Icon name="trash" size={20} />Delete page</button>
      </div>
    </Sheet>
  );
}
