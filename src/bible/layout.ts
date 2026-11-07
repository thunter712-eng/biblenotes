/** Decodes the compact verse format written by scripts/usfm.ts. */

export interface VerseLine {
  text: string;
  indent: boolean;
  /** A label inside the verse, such as a speaker. Not part of the verse text. */
  label?: boolean;
}

export interface DecodedVerse {
  number: number;
  /** "p" starts a paragraph, "q" starts a poetry block, "" flows on from the previous verse. */
  start: '' | 'p' | 'q';
  lines: VerseLine[];
  /** Plain text with single spaces, for search, copy and quotes. */
  plain: string;
  /** Labels above the verse, such as a speaker in Song of Solomon. */
  labels?: string[];
}

export function decodeVerse(number: number, raw: string): DecodedVerse {
  let body = raw;
  let start: DecodedVerse['start'] = '';
  if (body[0] === '¶') {
    start = 'p';
    body = body.slice(1);
  } else if (body[0] === '§') {
    start = 'q';
    body = body.slice(1);
  }
  const lines: VerseLine[] = body.split('\n').map((l) =>
    l[0] === '‡' ? { text: l.slice(1), indent: false, label: true } : { text: l.replace(/^\t/, ''), indent: l[0] === '\t' },
  );
  return { number, start, lines, plain: lines.filter((l) => !l.label).map((l) => l.text).join(' ') };
}

/** Word tokens of a verse. Word-range highlights index into this list. */
export function verseWords(plain: string): string[] {
  return plain.split(/\s+/).filter(Boolean);
}
