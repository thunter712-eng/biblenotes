import { describe, expect, it } from 'vitest';
import { adjacentChapter, formatRange, formatVerseList, parseReference, refKey, toRuns } from './refs.ts';

describe('parseReference', () => {
  it.each([
    ['John 3:16', { book: 'JHN', chapter: 3, verseStart: 16, verseEnd: 16 }],
    ['1 Cor 13', { book: '1CO', chapter: 13 }],
    ['Ps 23:1-4', { book: 'PSA', chapter: 23, verseStart: 1, verseEnd: 4 }],
    ['psalm 119:105', { book: 'PSA', chapter: 119, verseStart: 105, verseEnd: 105 }],
    ['1cor 13', { book: '1CO', chapter: 13 }],
    ['I John 4:8', { book: '1JN', chapter: 4, verseStart: 8, verseEnd: 8 }],
    ['2nd Timothy 3:16', { book: '2TI', chapter: 3, verseStart: 16, verseEnd: 16 }],
    ['Song of Songs 2', { book: 'SNG', chapter: 2 }],
    ['Jude 5', { book: 'JUD', chapter: 1, verseStart: 5, verseEnd: 5 }],
    ['Phm 3-4', { book: 'PHM', chapter: 1, verseStart: 3, verseEnd: 4 }],
    ['John 3:16-4:2', { book: 'JHN', chapter: 3, verseStart: 16, chapterEnd: 4, verseEnd: 2 }],
    ['Rom', { book: 'ROM', chapter: 1 }],
    ['rev 21', { book: 'REV', chapter: 21 }],
    ['Gen. 1:1', { book: 'GEN', chapter: 1, verseStart: 1, verseEnd: 1 }],
    ['John 3:16–17', { book: 'JHN', chapter: 3, verseStart: 16, verseEnd: 17 }],
  ])('%s', (input, expected) => {
    expect(parseReference(input)).toEqual(expected);
  });

  it.each(['', 'Nonsense 3', 'John 99', '12', 'J 3'])('rejects %s', (input) => {
    expect(parseReference(input)).toBeNull();
  });
});

describe('formatting and ordering', () => {
  it('formats ranges', () => {
    expect(formatRange('JHN.3.16', 'JHN.3.17')).toBe('John 3:16-17');
    expect(formatRange('JHN.3.16')).toBe('John 3:16');
    expect(formatRange('JHN.3.36', 'JHN.4.2')).toBe('John 3:36-4:2');
    expect(formatRange('PSA.23.1')).toBe('Psalm 23:1');
  });
  it('formats verse lists', () => {
    expect(formatVerseList([19, 16, 17])).toBe('16-17, 19');
    expect(toRuns([1, 2, 5])).toEqual([[1, 2], [5, 5]]);
  });
  it('orders canonically, not alphabetically', () => {
    expect(refKey('GEN.50.26')).toBeLessThan(refKey('EXO.1.1'));
    expect(refKey('JHN.3.9')).toBeLessThan(refKey('JHN.3.10'));
    expect(refKey('MAL.4.6')).toBeLessThan(refKey('MAT.1.1'));
  });
  it('walks across book boundaries', () => {
    expect(adjacentChapter('MAT', 1, -1)).toEqual({ book: 'MAL', chapter: 4 });
    expect(adjacentChapter('MAL', 4, 1)).toEqual({ book: 'MAT', chapter: 1 });
    expect(adjacentChapter('GEN', 1, -1)).toBeNull();
    expect(adjacentChapter('REV', 22, 1)).toBeNull();
  });
});
