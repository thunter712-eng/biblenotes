import { db, type BingoCard } from '../db/schema.ts';
import { todayIso } from '../ink/paper.ts';

export interface Square {
  id: string;
  label: string;
}

export const FREE_ID = 'free';
export const FREE_INDEX = 12;

/** The board from church, row by row. The free space sits in the middle and isn't listed. */
export const DEFAULT_SQUARES: Square[] = [
  'Mississippi St reference', 'Charles Dickens', 'Dietrich Bonhoeffer', 'Narnia / Aslan', 'Robert Frost',
  'Uses the Message translation', '“Death doesn’t get the last word”', 'Lord of the Rings', '“One of my sons”', 'Charles Spurgeon',
  'Dr. Seuss', 'C.S. Lewis', 'Wizard of Oz', 'Anything baseball',
  'Salt & light', '*Knocks on table*', 'A Tale of Two Cities', 'Pop culture fail', 'Old church',
  'New Orleans', 'T.S. Eliot', '“Preview of coming attractions”', 'Going on a run', 'Sings a song',
].map((label, i) => ({ id: `s${i + 1}`, label }));

/** The 25 cells in board order, with the free space at the center. */
export function boardCells(squares: Square[]): Square[] {
  const cells = squares.slice(0, 24);
  cells.splice(FREE_INDEX, 0, { id: FREE_ID, label: 'Free space' });
  return cells;
}

/** The Sunday a card belongs to: today on a Sunday, otherwise the Sunday just past. */
export function sundayFor(d = new Date()): string {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
  return todayIso(s);
}

export function shiftSunday(iso: string, weeks: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return todayIso(new Date(y, m - 1, d + weeks * 7));
}

const LINES: number[][] = [
  ...[0, 1, 2, 3, 4].map((r) => [0, 1, 2, 3, 4].map((c) => r * 5 + c)),
  ...[0, 1, 2, 3, 4].map((c) => [0, 1, 2, 3, 4].map((r) => r * 5 + c)),
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
];

/** The completed rows, columns and diagonals, as lists of cell indexes. The free space always counts. */
export function bingoLines(cells: Square[], counts: Record<string, number>): number[][] {
  const marked = (i: number) => cells[i].id === FREE_ID || (counts[cells[i].id] ?? 0) > 0;
  return LINES.filter((line) => line.every(marked));
}

export interface SquareStat {
  square: Square;
  /** Every mention, across all Sundays. */
  total: number;
  /** Sundays it came up at least once. */
  sundays: number;
}

export interface BingoStats {
  /** Sundays with at least one square marked. */
  played: number;
  bingos: number;
  squares: SquareStat[];
}

export function computeStats(squares: Square[], cards: BingoCard[]): BingoStats {
  const played = cards.filter((c) => Object.values(c.counts).some((n) => n > 0));
  const cells = boardCells(squares);
  return {
    played: played.length,
    bingos: played.filter((c) => bingoLines(cells, c.counts).length > 0).length,
    squares: squares.slice(0, 24).map((square) => ({
      square,
      total: played.reduce((sum, c) => sum + (c.counts[square.id] ?? 0), 0),
      sundays: played.filter((c) => (c.counts[square.id] ?? 0) > 0).length,
    })).sort((a, b) => b.total - a.total || b.sundays - a.sundays),
  };
}

export async function loadSquares(): Promise<Square[]> {
  const row = await db.kv.get('bingoSquares');
  const saved = row?.value as Square[] | undefined;
  return saved?.length === 24 ? saved : DEFAULT_SQUARES;
}

export const saveSquares = (squares: Square[]) => db.kv.put({ key: 'bingoSquares', value: squares });

/** Adds or takes back one mention of a square on a Sunday's card. */
export async function bumpSquare(sunday: string, id: string, by: 1 | -1) {
  if (id === FREE_ID) return;
  await db.transaction('rw', db.bingo, async () => {
    const now = Date.now();
    const card = (await db.bingo.get(sunday)) ?? { id: sunday, counts: {}, createdAt: now, updatedAt: now };
    const next = Math.max(0, (card.counts[id] ?? 0) + by);
    const counts = { ...card.counts };
    if (next) counts[id] = next; else delete counts[id];
    await db.bingo.put({ ...card, counts, updatedAt: now });
  });
}
