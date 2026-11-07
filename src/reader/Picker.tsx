import { useMemo, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BOOKS, BOOK_GROUPS, getBook, type BookInfo } from '../bible/books.ts';
import { parseReference } from '../bible/refs.ts';
import { navigate } from '../app/router.ts';
import { db } from '../db/schema.ts';
import { Sheet } from '../ui/primitives.tsx';

export function goToReference(text: string): boolean {
  const r = parseReference(text);
  if (!r) return false;
  navigate({ name: 'read', book: r.book, chapter: r.chapter, ...(r.verseStart ? { verse: r.verseStart } : {}) });
  return true;
}

/** Book and chapter picker. Typing a reference is always one field away. */
export function Picker({ onClose, currentBook, currentChapter }: { onClose: () => void; currentBook: string; currentChapter: number }) {
  const [book, setBook] = useState<BookInfo | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const recent = useLiveQuery(() => db.history.orderBy('visitedAt').reverse().limit(6).toArray(), []);
  const groups = useMemo(() => BOOK_GROUPS.map((g) => ({ g, books: BOOKS.filter((b) => b.group === g) })), []);

  const go = (b: string, c: number) => {
    navigate({ name: 'read', book: b, chapter: c });
    onClose();
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (goToReference(text)) onClose();
    else setError(`"${text}" isn't a reference. Try John 3:16, 1 Cor 13 or Ps 23:1-4.`);
  };
  const pickBook = (b: BookInfo) => (b.chapters === 1 ? go(b.id, 1) : setBook(b));

  return (
    <Sheet title={book ? book.name : 'Go to'} onClose={onClose} width={720}>
      <form onSubmit={submit} className="goto">
        <input
          type="text" value={text} onChange={(e) => { setText(e.target.value); setError(''); }}
          placeholder="John 3:16, 1 Cor 13, Ps 23:1-4" aria-label="Go to reference"
          autoCapitalize="words" autoCorrect="off" spellCheck={false} enterKeyHint="go"
        />
        <button type="submit" className="btn">Go</button>
      </form>
      {error && <p className="form-error" role="alert">{error}</p>}
      {book ? (
        <>
          <button type="button" className="link-btn" onClick={() => setBook(null)}>All books</button>
          <div className="chapter-grid">
            {Array.from({ length: book.chapters }, (_, i) => i + 1).map((c) => (
              <button key={c} type="button" className={`chip ${book.id === currentBook && c === currentChapter ? 'is-active' : ''}`} onClick={() => go(book.id, c)}>{c}</button>
            ))}
          </div>
        </>
      ) : (
        <>
          {!!recent?.length && (
            <div className="picker-recent">
              <h3>Recent</h3>
              <div className="recent-row">
                {recent.map((r) => {
                  const [b, c] = r.chapterKey.split('.');
                  return <button key={r.chapterKey} type="button" className="chip chip-wide" onClick={() => go(b, +c)}>{getBook(b)?.name} {c}</button>;
                })}
              </div>
            </div>
          )}
          {groups.map(({ g, books }) => (
            <section key={g} className="book-group">
              <h3>{g}</h3>
              <div className="book-grid">
                {books.map((b) => (
                  <button key={b.id} type="button" className={`chip ${b.id === currentBook ? 'is-active' : ''}`} onClick={() => pickBook(b)}>{b.name}</button>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </Sheet>
  );
}
