import { useState } from 'react';
import type { Favorite } from '../db/schema.ts';
import { addFavorite, deleteFavorite, updateFavorite } from '../db/study.ts';
import { todayIso } from '../ink/paper.ts';
import { Sheet, toast } from '../ui/primitives.tsx';

export interface FavoriteDraft {
  book: string;
  chapter: number;
  verses: number[];
  label: string;
  text: string;
  abbr: string;
}

/** Marks verses as a favorite, or edits one: the day it was chosen, and when and why. */
export function FavoriteSheet({ favorite, draft, onClose }: { favorite?: Favorite; draft?: FavoriteDraft; onClose: () => void }) {
  const [addedOn, setAddedOn] = useState(favorite?.addedOn ?? todayIso());
  const [why, setWhy] = useState(favorite?.why ?? '');
  const label = favorite?.label ?? draft?.label ?? '';
  const text = favorite?.text ?? draft?.text ?? '';
  const abbr = favorite?.abbr ?? draft?.abbr ?? '';

  const save = async () => {
    const day = addedOn || todayIso();
    if (favorite) {
      await updateFavorite(favorite.id, { addedOn: day, why: why.trim() });
      toast('Favorite saved');
    } else if (draft) {
      await addFavorite({ ...draft, addedOn: day, why: why.trim() });
      toast(`Added ${label} to favorites`);
    }
    onClose();
  };
  const remove = async () => {
    if (!favorite) return;
    onClose();
    const undo = await deleteFavorite(favorite.id);
    toast(`Removed ${label} from favorites`, { label: 'Undo', run: () => void undo() });
  };

  return (
    <Sheet
      title={favorite ? 'Favorite verse' : 'Add to favorites'} onClose={onClose} width={520}
      footer={<>
        {favorite && <button type="button" className="btn btn-danger" onClick={() => void remove()}>Remove favorite</button>}
        <span className="sheet-foot-gap" />
        <button type="button" className="btn" onClick={() => void save()}>{favorite ? 'Save' : 'Add to favorites'}</button>
      </>}
    >
      <figure className="fav-quote">
        <blockquote>{text}</blockquote>
        <figcaption>{label} ({abbr})</figcaption>
      </figure>
      <div className="form-stack">
        <label className="field">
          <span className="field-label">Date chosen</span>
          <input type="date" value={addedOn} max={todayIso()} onChange={(e) => setAddedOn(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">When and why you chose it</span>
          <textarea rows={5} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="What was happening, and what this verse meant to you then" />
        </label>
      </div>
    </Sheet>
  );
}
