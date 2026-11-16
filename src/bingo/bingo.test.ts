import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/schema.ts';
import { bingoLines, boardCells, bumpSquare, computeStats, DEFAULT_SQUARES, FREE_ID, shiftSunday, sundayFor } from './bingo.ts';

beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())); });

describe('bingo', () => {
  it('dates a card to that Sunday, or the Sunday just past', () => {
    expect(sundayFor(new Date(2026, 10, 15))).toBe('2026-11-15'); // a Sunday
    expect(sundayFor(new Date(2026, 10, 18))).toBe('2026-11-15'); // the Wednesday after
    expect(sundayFor(new Date(2026, 10, 14))).toBe('2026-11-08'); // the Saturday before
    expect(shiftSunday('2026-11-15', -1)).toBe('2026-11-08');
    expect(shiftSunday('2026-12-27', 1)).toBe('2027-01-03');
  });

  it('puts the free space in the middle and counts it toward a line', () => {
    const cells = boardCells(DEFAULT_SQUARES);
    expect(cells).toHaveLength(25);
    expect(cells[12].id).toBe(FREE_ID);
    // C.S. Lewis, Dr. Seuss, Wizard of Oz and Anything baseball fill the middle row with the free space.
    const counts = { s11: 1, s12: 2, s13: 1, s14: 1 };
    expect(bingoLines(cells, counts)).toEqual([[10, 11, 12, 13, 14]]);
    expect(bingoLines(cells, { s11: 1 })).toEqual([]);
  });

  it('counts each mention, takes one back, and totals across Sundays', async () => {
    await bumpSquare('2026-11-08', 's12', 1);
    await bumpSquare('2026-11-15', 's12', 1);
    await bumpSquare('2026-11-15', 's12', 1);
    await bumpSquare('2026-11-15', 's20', 1);
    await bumpSquare('2026-11-15', 's20', -1);
    await bumpSquare('2026-11-15', FREE_ID, 1);
    expect((await db.bingo.get('2026-11-15'))?.counts).toEqual({ s12: 2 });
    const stats = computeStats(DEFAULT_SQUARES, await db.bingo.toArray());
    expect(stats.played).toBe(2);
    expect(stats.squares[0]).toMatchObject({ square: { label: 'C.S. Lewis' }, total: 3, sundays: 2 });
    expect(stats.squares.find((s) => s.square.id === 's20')?.total).toBe(0);
  });
});
