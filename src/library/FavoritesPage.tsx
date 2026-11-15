import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { PageShell } from '../app/PageShell.tsx';
import { navigate } from '../app/router.ts';
import { parseVerseRef } from '../bible/refs.ts';
import { db, type Favorite } from '../db/schema.ts';
import { FavoriteSheet } from '../reader/FavoriteSheet.tsx';

function longDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
}

/** Favorite verses, newest first and grouped by year, each with when and why it was chosen. */
export function FavoritesPage() {
  const favorites = useLiveQuery(() => db.favorites.orderBy('addedOn').reverse().toArray(), []);
  const [editing, setEditing] = useState<Favorite | null>(null);
  // Looked up live, so a save shows straight away.
  const current = editing && favorites?.find((f) => f.id === editing.id);

  const years = new Map<string, Favorite[]>();
  for (const f of favorites ?? []) {
    const y = f.addedOn.slice(0, 4);
    years.set(y, [...(years.get(y) ?? []), f]);
  }

  const read = (f: Favorite) => {
    const { book, chapter, verse } = parseVerseRef(f.startRef);
    navigate({ name: 'read', book, chapter, verse });
  };

  return (
    <PageShell title="Favorite verses">
      {favorites && !favorites.length && (
        <div className="fav-empty">
          <p>Tap a verse while reading, then tap <strong>Favorite</strong>. You can note the day you chose it and why.</p>
          <button type="button" className="btn" onClick={() => history.back()}>Back to reading</button>
        </div>
      )}
      {[...years].map(([year, list]) => (
        <section key={year} className="fav-year" aria-label={year}>
          <h2 className="fav-year-head">{year}</h2>
          <ol className="fav-list">
            {list.map((f) => (
              <li key={f.id} className="fav-entry">
                <time className="fav-date" dateTime={f.addedOn}>{longDate(f.addedOn)}</time>
                <div className="fav-body">
                  <button type="button" className="fav-ref" onClick={() => read(f)} aria-label={`Read ${f.label} in context`}>{f.label}</button>
                  <blockquote className="fav-text">{f.text}</blockquote>
                  {f.why
                    ? <p className="fav-why">{f.why}</p>
                    : <p className="fav-why is-empty">No note yet.</p>}
                  <button type="button" className="link-btn" onClick={() => setEditing(f)}>{f.why ? 'Edit note' : 'Add when and why'}</button>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
      {current && <FavoriteSheet favorite={current} onClose={() => setEditing(null)} />}
    </PageShell>
  );
}
