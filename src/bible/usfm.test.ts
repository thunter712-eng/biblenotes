import { describe, expect, it } from 'vitest';
import { cleanInline, parseUsfm } from '../../scripts/usfm.ts';

describe('cleanInline', () => {
  it('strips strong tags, footnotes and cross references', () => {
    expect(cleanInline('\\w In|strong="G1722"\\w* the\\f + \\fr 1:5 \\ft Note\\f* \\+w word|strong="G1"\\+w*\\x - \\xo 1 \\xt Gen\\x*.')).toBe('In the word.');
  });
  it('keeps supplied words and Selah', () => {
    expect(cleanInline('\\add is\\add* good \\qs Selah.\\qs*')).toBe('is good Selah.');
  });
});

describe('parseUsfm', () => {
  const src = [
    '\\id PSA test', '\\h Psalms', '\\mt1 The Psalms', '\\c 1', '\\ms1 BOOK 1', '\\d A title', '\\q1',
    '\\v 1 Blessed is the man', '\\q2 who walks', '\\q1', '\\v 2 but his delight', '\\c 2', '\\p', '\\v 1 Prose one.', '\\v 2 Prose two.', '\\p', '\\v 3 New para.',
  ].join('\n');
  const book = parseUsfm('PSA', src);

  it('reads the name and chapters', () => {
    expect(book.name).toBe('Psalms');
    expect(book.chapters.length).toBe(2);
  });
  it('keeps headings separately', () => {
    expect(book.headings).toEqual({ 1: ['BOOK 1', 'A title'] });
  });
  it('encodes poetry lines', () => {
    expect(book.chapters[0][0]).toBe('§Blessed is the man\n\twho walks');
    expect(book.chapters[0][1]).toBe('§but his delight');
  });
  it('encodes paragraph starts', () => {
    expect(book.chapters[1]).toEqual(['¶Prose one.', 'Prose two.', '¶New para.']);
  });
});
