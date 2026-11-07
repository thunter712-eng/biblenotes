// Converts one USFM book into the compact format the app reads.
//
// Verse text conventions (decoded in src/bible/layout.ts):
//   leading "¶"  the verse starts a new paragraph
//   leading "§"  the verse starts a poetry block
//   "\n"         a line break inside a verse (poetry)
//   "\t"         after a line break: an indented poetry line (\q2 and deeper)
//   "‡"          starts a line that is a label inside the verse, such as a speaker, not verse text

export interface BookJson {
  id: string;
  name: string;
  /** chapters[c - 1][v - 1]; null marks a verse number this translation omits. */
  chapters: (string | null)[][];
  /** Headings shown above a chapter's first verse, such as psalm titles. Keyed by chapter number. */
  headings?: Record<string, string[]>;
  /** Labels shown above a verse, such as the speakers in Song of Solomon. Keyed "chapter.verse". */
  verseHeadings?: Record<string, string[]>;
}

const POETRY = /^q(\d?|[acmr])$/;
const PARAGRAPH = /^(p|m|nb|pi\d?|pc|pm|pmo|mi|cls|li\d?|b)$/;
const HEADING = /^(d|ms\d?)$/;
const VERSE_HEADING = /^(sp)$/;
const STRUCTURAL_SKIP = /^(r|mr|s\d?|qa|cl|cp|cd|rem|h\d?|toc\d?|toca\d?|id|ide|usfm|sts|mt\d?|mte\d?|is\d?|ip|ipi|ib|ili\d?|io\d?|iot|imt\d?|im|iq\d?)$/;

/** Removes apparatus and character markup, keeping only the words. */
export function cleanInline(s: string): string {
  return s
    .replace(/\\f\s.*?\\f\*/gs, '')
    .replace(/\\fe\s.*?\\fe\*/gs, '')
    .replace(/\\x\s.*?\\x\*/gs, '')
    .replace(/\\\+?([a-z]+\d?)\s+([^\\|]*?)\|[^\\]*?\\\+?\1\*/g, '$2')
    .replace(/\\\+?[a-z]+\d?\*/g, '')
    .replace(/\\\+?[a-z]+\d?\s?/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export function parseUsfm(id: string, source: string): BookJson {
  const name = /^\\h\s+(.+?)\s*$/m.exec(source)?.[1] ?? id;
  const chapters: (string | null)[][] = [];
  const headings: Record<string, string[]> = {};
  const verseHeadings: Record<string, string[]> = {};
  let pendingLabels: string[] = [];
  let chapter = 0;
  let verse = 0;
  let current = '';
  let pending: '' | '¶' | '§' = '';
  let lineStart = false;
  let indent = false;

  const flush = () => {
    if (chapter > 0 && verse > 0) {
      const list = chapters[chapter - 1];
      while (list.length < verse) list.push(null);
      list[verse - 1] = current.trimEnd();
    }
    current = '';
  };

  /** A label that falls inside a verse stays there, so a change of speaker keeps its exact position. */
  const embedLabels = () => {
    if (!pendingLabels.length) return;
    current = `${current.trimEnd()}${pendingLabels.map((l) => `\n‡${l}`).join('')}`;
    pendingLabels = [];
    lineStart = true;
  };

  const append = (raw: string) => {
    const text = cleanInline(raw);
    if (!text || verse === 0) return;
    if (current && !/^[¶§]$/.test(current)) embedLabels();
    if (lineStart && current && !/^[¶§]$/.test(current)) current = `${current.trimEnd()}\n${indent ? '\t' : ''}`;
    else if (current && !/[\n\t¶§]$/.test(current)) current += ' ';
    current += text;
    lineStart = false;
  };

  // Each marker that begins a line starts a token. Inline markers stay inside the token's text.
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^\\([a-z]+\d?)\b\s*(.*)$/s.exec(line);
    if (!m) {
      append(line);
      continue;
    }
    const [, marker, rest] = m;
    if (marker === 'c') {
      flush();
      chapter = parseInt(rest, 10);
      verse = 0;
      chapters[chapter - 1] = [];
      // A heading after a chapter's last verse belongs to the next chapter, such as "BOOK II".
      if (pendingLabels.length) {
        headings[chapter] = pendingLabels;
        pendingLabels = [];
      }
      pending = '¶';
      continue;
    }
    if (chapter === 0) continue; // Introductions and front matter come before \c 1.
    if (marker === 'v') {
      flush();
      const v = /^(\d+)[a-z]?(?:-\d+[a-z]?)?\s*(.*)$/s.exec(rest);
      if (!v) throw new Error(`Bad verse marker in ${id} ${chapter}: ${line}`);
      verse = parseInt(v[1], 10);
      if (pendingLabels.length) {
        verseHeadings[`${chapter}.${verse}`] = pendingLabels;
        pendingLabels = [];
      }
      current = pending;
      pending = '';
      lineStart = false;
      indent = false;
      append(v[2]);
      continue;
    }
    if (HEADING.test(marker)) {
      const text = cleanInline(rest);
      // Before the first verse it heads the chapter. After a verse it introduces what comes next,
      // such as the Hebrew letters that divide Psalm 119.
      if (text && verse === 0) (headings[chapter] ??= []).push(text);
      else if (text) pendingLabels.push(text);
      continue;
    }
    if (VERSE_HEADING.test(marker) || (marker === 'qc' && rest)) {
      const text = cleanInline(rest);
      if (text) pendingLabels.push(text);
      continue;
    }
    if (STRUCTURAL_SKIP.test(marker)) continue;
    const isPoetry = POETRY.test(marker);
    if (isPoetry || PARAGRAPH.test(marker)) {
      const inVerseHasText = verse > 0 && current && !/^[¶§]$/.test(current);
      if (rest || inVerseHasText) {
        // The marker falls inside a verse, either with text on this line or text to follow.
        if (inVerseHasText) {
          lineStart = true;
          indent = isPoetry && marker !== 'q1' && marker !== 'q';
        }
      }
      if (!rest || !inVerseHasText) {
        // A marker alone on its line governs the next \v. Poetry wins over a pending paragraph.
        if (marker !== 'b') pending = isPoetry ? '§' : '¶';
        else if (!pending) pending = '¶';
      }
      if (rest) append(rest);
      continue;
    }
    append(line);
  }
  // A heading after the book's last verse has nowhere to carry forward to, such as Habakkuk's closing note.
  embedLabels();
  flush();

  const book: BookJson = { id, name, chapters };
  if (Object.keys(headings).length) book.headings = headings;
  if (Object.keys(verseHeadings).length) book.verseHeadings = verseHeadings;
  return book;
}
