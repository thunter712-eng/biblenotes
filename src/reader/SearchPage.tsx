import { useEffect, useRef, useState, type ReactNode } from 'react';
import { navigate } from '../app/router.ts';
import { useSettings } from '../app/settings.ts';
import { formatRange, parseVerseRef } from '../bible/refs.ts';
import { searchBible, type SearchHit } from '../bible/search.ts';
import { useTranslations } from './ReadingSettings.tsx';
import { PageShell } from '../app/PageShell.tsx';

const MAX_SHOWN = 500;

function markTerms(text: string, query: string): ReactNode {
  const terms = query.replace(/"/g, '').trim().split(/\s+/).filter(Boolean).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!terms.length) return text;
  const parts = text.split(new RegExp(`(${terms.join('|')})`, 'gi'));
  return parts.map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p));
}

export function SearchPage({ initialQuery }: { initialQuery?: string }) {
  const s = useSettings();
  const translations = useTranslations();
  const [query, setQuery] = useState(initialQuery ?? '');
  const [active, setActive] = useState(initialQuery ?? '');
  const [selected, setSelected] = useState<string[]>([s.translation]);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [total, setTotal] = useState(0);
  const [progress, setProgress] = useState(1);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!initialQuery) input.current?.focus(); }, [initialQuery]);

  useEffect(() => {
    setHits([]);
    setTotal(0);
    if (!active.trim() || !selected.length) { setProgress(1); return; }
    const ac = new AbortController();
    setProgress(0);
    const buffer: SearchHit[] = [];
    let count = 0;
    void searchBible(selected, active, (found, p) => {
      count += found.length;
      if (buffer.length < MAX_SHOWN) buffer.push(...found.slice(0, MAX_SHOWN - buffer.length));
      setHits([...buffer]);
      setTotal(count);
      setProgress(p);
    }, ac.signal);
    return () => ac.abort();
  }, [active, selected]);

  const abbr = (id: string) => translations.find((t) => t.id === id)?.abbr ?? id;
  return (
    <PageShell title="Search the Bible">
      <form className="goto" onSubmit={(e) => { e.preventDefault(); setActive(query); navigate({ name: 'search', query }, true); }}>
        <input ref={input} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder='Words, or "an exact phrase"' aria-label="Search words" enterKeyHint="search" />
        <button type="submit" className="btn">Search</button>
      </form>
      <div className="check-line">
        {translations.map((t) => (
          <label key={t.id} className="check-row">
            <input type="checkbox" checked={selected.includes(t.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, t.id] : selected.filter((x) => x !== t.id))} />
            <span>{t.abbr}</span>
          </label>
        ))}
      </div>
      {progress < 1 && <progress value={progress} max={1} aria-label="Search progress" />}
      {active && progress >= 1 && <p className="muted" data-testid="search-count">{total === 0 ? `No verses match "${active}".` : `${total} ${total === 1 ? 'verse' : 'verses'}${total > MAX_SHOWN ? `, showing the first ${MAX_SHOWN}` : ''}`}</p>}
      <ol className="result-list">
        {hits.map((h) => {
          const a = parseVerseRef(h.ref);
          return (
            <li key={`${h.translation}-${h.ref}`}>
              <button type="button" className="result" onClick={() => { s.set({ translation: h.translation }); navigate({ name: 'read', book: a.book, chapter: a.chapter, verse: a.verse }); }}>
                <span className="result-ref">{formatRange(h.ref)} <span className="muted">{abbr(h.translation)}</span></span>
                <span className="result-text">{markTerms(h.text, active)}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </PageShell>
  );
}
