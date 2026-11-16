import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema.ts';
import { IconButton, Segmented } from '../ui/primitives.tsx';
import { bingoLines, boardCells, bumpSquare, computeStats, FREE_ID, loadSquares, saveSquares, shiftSunday, sundayFor, type Square } from './bingo.ts';

const HOLD_MS = 500;

function sundayLabel(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** One cell. A tap adds a mention; pressing and holding takes one back. */
function Cell({ square, count, inLine, onBump }: { square: Square; count: number; inLine: boolean; onBump: (by: 1 | -1) => void }) {
  const timer = useRef(0);
  const held = useRef(false);
  const free = square.id === FREE_ID;
  const start = () => {
    held.current = false;
    timer.current = window.setTimeout(() => { held.current = true; onBump(-1); }, HOLD_MS);
  };
  const stop = () => clearTimeout(timer.current);
  const marked = free || count > 0;
  return (
    <button
      type="button"
      className={`bingo-cell ${marked ? 'is-marked' : ''} ${inLine ? 'in-line' : ''} ${free ? 'is-free' : ''}`}
      aria-label={free ? 'Free space' : `${square.label}${count ? `, ${count} ${count === 1 ? 'time' : 'times'}` : ''}`}
      disabled={free}
      onPointerDown={free ? undefined : start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => { if (free) return; if (held.current) { held.current = false; return; } onBump(1); }}
    >
      <span className="bingo-label">{free ? 'Free' : square.label}</span>
      {count > 1 && <span className="bingo-count">×{count}</span>}
    </button>
  );
}

/**
 * The Sunday bingo card, tucked in a corner. Opened by holding the ribbon, and closed with its own button
 * or the ribbon again, so it can stay up while writing.
 */
export function BingoCard({ onClose }: { onClose: () => void }) {
  const thisSunday = sundayFor();
  const [sunday, setSunday] = useState(thisSunday);
  const [view, setView] = useState<'card' | 'stats' | 'edit'>('card');
  const [squares, setSquares] = useState<Square[] | null>(null);
  const card = useLiveQuery(() => db.bingo.get(sunday), [sunday]);
  const allCards = useLiveQuery(() => db.bingo.toArray(), []);

  useEffect(() => { void loadSquares().then(setSquares); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!squares) return null;
  const cells = boardCells(squares);
  const counts = card?.counts ?? {};
  const lines = bingoLines(cells, counts);
  const inLine = new Set(lines.flat());
  const stats = view === 'stats' ? computeStats(squares, allCards ?? []) : null;

  const rename = (i: number, label: string) => {
    const next = squares.map((s, n) => (n === i ? { ...s, label: label.trim() || s.label } : s));
    setSquares(next);
    void saveSquares(next);
  };

  return (
    <aside className="bingo" role="dialog" aria-label={`Bingo card for ${sundayLabel(sunday)}`} data-engine-ignore>
      <header className="bingo-head">
        <IconButton icon="back" size={18} label="Previous Sunday" onClick={() => setSunday(shiftSunday(sunday, -1))} />
        <span className="bingo-date">{sundayLabel(sunday)}</span>
        <IconButton icon="forward" size={18} label="Next Sunday" disabled={sunday >= thisSunday} onClick={() => setSunday(shiftSunday(sunday, 1))} />
        <span className="bingo-gap">{lines.length > 0 && <span className="bingo-stamp" role="status">Bingo!</span>}</span>
        <IconButton icon="close" size={18} label="Hide bingo card" onClick={onClose} />
      </header>
      <Segmented<'card' | 'stats' | 'edit'> label="Bingo view" value={view} onChange={setView} options={[{ value: 'card', label: 'Card' }, { value: 'stats', label: 'Stats' }, { value: 'edit', label: 'Squares' }]} />

      {view === 'card' && (
        <div className="bingo-board-wrap">
          <div className="bingo-board" role="group" aria-label="Squares">
            {cells.map((sq, i) => (
              <Cell key={sq.id} square={sq} count={counts[sq.id] ?? 0} inLine={inLine.has(i)} onBump={(by) => void bumpSquare(sunday, sq.id, by)} />
            ))}
          </div>
          <p className="bingo-hint">Tap to count a mention. Hold to take one back.</p>
        </div>
      )}

      {view === 'stats' && stats && (
        <div className="bingo-stats">
          <p className="bingo-summary">
            {stats.played ? <>{stats.played} {stats.played === 1 ? 'Sunday' : 'Sundays'} played, {stats.bingos} {stats.bingos === 1 ? 'bingo' : 'bingos'}.</> : 'No Sundays marked yet.'}
          </p>
          <ol className="bingo-stat-list">
            {stats.squares.map((s) => (
              <li key={s.square.id} className={s.total ? '' : 'is-zero'}>
                <span className="bingo-stat-label">{s.square.label}</span>
                <span className="bingo-stat-bar" aria-hidden="true"><span style={{ width: `${stats.squares[0].total ? (s.total / stats.squares[0].total) * 100 : 0}%` }} /></span>
                <span className="bingo-stat-num">{s.total ? `${s.total}× in ${s.sundays} of ${stats.played}` : 'Not yet'}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {view === 'edit' && (
        <div className="bingo-edit">
          <p className="bingo-hint">Renaming a square keeps its counts. The free space stays in the middle.</p>
          {squares.map((s, i) => (
            <input key={s.id} type="text" defaultValue={s.label} aria-label={`Square ${i < 12 ? i + 1 : i + 2}`} onBlur={(e) => rename(i, e.target.value)} />
          ))}
        </div>
      )}
    </aside>
  );
}
