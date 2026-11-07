import { describe, expect, it } from 'vitest';
import { applyDrag, applyTap, EMPTY_SELECTION } from './selection.ts';

describe('verse selection', () => {
  it('selects, then extends to a range', () => {
    const one = applyTap(EMPTY_SELECTION, 16, false);
    expect(one.verses).toEqual([16]);
    expect(applyTap(one, 17, false).verses).toEqual([16, 17]);
    expect(applyTap(one, 13, false).verses).toEqual([13, 14, 15, 16]);
  });
  it('removes a tapped verse, leaving a non-contiguous selection', () => {
    let s = applyTap(EMPTY_SELECTION, 1, false);
    s = applyTap(s, 4, false);
    s = applyTap(s, 2, false);
    expect(s.verses).toEqual([1, 3, 4]);
  });
  it('clears when the last verse is removed', () => {
    expect(applyTap(applyTap(EMPTY_SELECTION, 5, false), 5, false)).toEqual(EMPTY_SELECTION);
  });
  it('picks separately in additive mode', () => {
    let s = applyTap(EMPTY_SELECTION, 2, true);
    s = applyTap(s, 9, true);
    expect(s.verses).toEqual([2, 9]);
  });
  it('skips verse numbers the translation omits', () => {
    const known = new Set([35, 37]);
    expect(applyTap(applyTap(EMPTY_SELECTION, 35, false, known), 37, false, known).verses).toEqual([35, 37]);
  });
  it('drags in either direction on top of an existing selection', () => {
    expect(applyDrag([1], 8, 5).verses).toEqual([1, 5, 6, 7, 8]);
  });
});
