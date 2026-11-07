import { describe, expect, it } from 'vitest';
import { cleanInline, parseUsfm } from '../../scripts/usfm.ts';
import { decodeVerse } from './layout.ts';

describe('cleanInline', () => {
  it('strips strong tags, footnotes and cross references', () => {
    expect(cleanInline('\\w In|strong="G1722"\\w* the\\f + \\fr 1:5 \\ft Note\\f* \\+w word|strong="G1"\\+w*\\x - \\xo 1 \\xt Gen\\x*.')).toBe('In the word.');
  });
  it('keeps supplied words and Selah', () => {
    expect(cleanInline('\\add is\\add* good \\qs Selah.\\qs*')).toBe('is good Selah.');
  });
});

it('keeps speaker labels with the verse they introduce', () => {
  const book = parseUsfm('SNG', ['\\id SNG', '\\h Song', '\\c 1', '\\sp Beloved', '\\q1', '\\v 2 Let him kiss me', '\\sp Friends', '\\q1', '\\v 4 We will rejoice'].join('\n'));
  expect(book.verseHeadings).toEqual({ '1.2': ['Beloved'], '1.4': ['Friends'] });
});

it('places headings that fall after a verse with what follows them', () => {
  const book = parseUsfm('PSA', [
    '\\id PSA', '\\h Psalms', '\\c 41', '\\d A title', '\\q1', '\\v 1 One', '\\ms1 BOOK II', '\\c 42', '\\d Another', '\\q1', '\\v 1 Two',
    '\\c 119', '\\qc ALEPH', '\\q1', '\\v 1 First', '\\q1 line two', '\\qc BETH', '\\q1', '\\v 2 Second', '\\d GIMEL', '\\q1', '\\v 3 Third',
  ].join('\n'));
  expect(book.headings).toEqual({ 41: ['A title'], 42: ['BOOK II', 'Another'] });
  expect(book.verseHeadings).toEqual({ '119.1': ['ALEPH'], '119.2': ['BETH'], '119.3': ['GIMEL'] });
  expect(book.chapters[118][0]).toBe('§First\nline two');
});

it('keeps a label in place when it falls inside a verse or after the last verse', () => {
  const book = parseUsfm('SNG', ['\\id SNG', '\\h Song', '\\c 1', '\\q1', '\\v 1 Take me away.', '\\sp Friends', '\\q1 We will rejoice.', '\\d For the Chief Musician.'].join('\n'));
  expect(book.chapters[0][0]).toBe('§Take me away.\n‡Friends\nWe will rejoice.\n‡For the Chief Musician.');
  const v = decodeVerse(1, book.chapters[0][0]!);
  expect(v.plain).toBe('Take me away. We will rejoice.');
  expect(v.lines.map((l) => l.label ?? false)).toEqual([false, true, false, true]);
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
