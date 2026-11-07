import { Fragment, memo, type ReactNode } from 'react';
import type { DecodedVerse } from '../bible/layout.ts';
import { verseWords } from '../bible/layout.ts';
import type { Highlight } from '../db/schema.ts';
import type { ChapterData } from '../bible/data.ts';
import type { WordSelection } from './selection.ts';

export interface VerseDecor {
  /** Whole-verse highlights and word-range highlights touching this verse. */
  highlights: Highlight[];
  selected: boolean;
  hasNotes: boolean;
  wordMode: boolean;
  words: WordSelection | null;
}

function hlClass(h: Pick<Highlight, 'color' | 'style'>) {
  return `hl hl-${h.style} hl-c-${h.color}`;
}

/** Marks each word with the highlight covering it, or null. */
function wordStyles(count: number, highlights: Highlight[]): (Highlight | null)[] {
  const out: (Highlight | null)[] = new Array(count).fill(null);
  for (const h of highlights) {
    if (!h.wordRange) continue;
    for (let i = h.wordRange.start; i <= Math.min(h.wordRange.end, count - 1); i++) out[i] = h;
  }
  return out;
}

const VerseBody = memo(function VerseBody({ verse, decor, showNumber, onMarker, translation }: {
  verse: DecodedVerse;
  decor: VerseDecor;
  showNumber: boolean;
  onMarker?: (v: number) => void;
  translation: string;
}) {
  const relevant = decor.highlights.filter((h) => !h.wordRange || h.translation === translation);
  const whole = relevant.filter((h) => !h.wordRange);
  const hasWordHighlights = relevant.some((h) => h.wordRange);

  let body: ReactNode;
  if (decor.wordMode || hasWordHighlights) {
    const all = verseWords(verse.plain);
    const styles = wordStyles(all.length, relevant);
    let index = 0;
    body = verse.lines.map((line, li) => {
      const words = verseWords(line.text);
      return (
        <Fragment key={li}>
          {li > 0 && <br />}
          {line.indent && <span className="q-indent" />}
          {words.map((w, wi) => {
            const i = index++;
            const st = styles[i];
            const inSel = decor.words && decor.words.verse === verse.number && i >= decor.words.start && i <= decor.words.end;
            const nextSameStyle = st && styles[i + 1] === st;
            const cls = [decor.wordMode ? 'w' : '', st ? hlClass(st) : '', inSel ? 'w-sel' : ''].filter(Boolean).join(' ');
            return (
              <Fragment key={wi}>
                <span className={cls || undefined} data-w={i}>{nextSameStyle ? `${w} ` : w}</span>
                {!nextSameStyle && wi < words.length - 1 ? ' ' : ''}
              </Fragment>
            );
          })}
        </Fragment>
      );
    });
  } else {
    body = verse.lines.map((line, li) => (
      <Fragment key={li}>
        {li > 0 && <br />}
        {line.indent && <span className="q-indent" />}
        {line.text}
      </Fragment>
    ));
  }

  return (
    <span className={`v ${decor.selected ? 'is-selected' : ''} ${decor.wordMode ? 'is-wordmode' : ''}`} data-v={verse.number} id={`v-${translation}-${verse.number}`}>
      {showNumber && <sup className="vn">{verse.number}</sup>}
      {decor.hasNotes && (
        <button type="button" className="note-marker" aria-label={`Show notes on verse ${verse.number}`} onClick={() => onMarker?.(verse.number)} />
      )}
      {whole.reduce<ReactNode>((inner, h) => <span className={hlClass(h)}>{inner}</span>, body)}{' '}
    </span>
  );
});

export const NO_DECOR: VerseDecor = { highlights: [], selected: false, hasNotes: false, wordMode: false, words: null };

type Block = { type: 'p' | 'q'; verses: DecodedVerse[]; key: number } | { type: 'after'; verse: number; key: number };

function buildBlocks(verses: DecodedVerse[], hasAfter: (v: number) => boolean): Block[] {
  const blocks: Block[] = [];
  let cur: Extract<Block, { verses: DecodedVerse[] }> | null = null;
  verses.forEach((v) => {
    if (!cur || v.start) {
      cur = { type: v.start === 'q' ? 'q' : 'p', verses: [], key: v.number };
      blocks.push(cur);
    }
    cur.verses.push(v);
    if (hasAfter(v.number)) {
      blocks.push({ type: 'after', verse: v.number, key: -v.number });
      cur = null;
    }
  });
  return blocks;
}

export interface ChapterTextProps {
  data: ChapterData;
  chapter: number;
  translation: string;
  showNumbers: boolean;
  decorFor: (v: number) => VerseDecor;
  renderAfter?: (v: number) => ReactNode;
  hasAfter?: (v: number) => boolean;
  onMarker?: (v: number) => void;
}

/** Flowing single-translation text with a printed-Bible drop numeral. */
export function ChapterText({ data, chapter, translation, showNumbers, decorFor, renderAfter, hasAfter, onMarker }: ChapterTextProps) {
  const blocks = buildBlocks(data.verses, hasAfter ?? (() => false));
  let dropped = false;
  return (
    <div className="chapter-text">
      {data.headings.map((h, i) => <p key={i} className="chapter-heading">{h}</p>)}
      {blocks.map((block) => {
        if (block.type === 'after') return <Fragment key={block.key}>{renderAfter?.(block.verse)}</Fragment>;
        const drop = !dropped;
        dropped = true;
        return (
          <div key={block.key} className={block.type === 'q' ? 'block-q' : 'block-p'}>
            {drop && <span className="drop-numeral" aria-hidden="true">{chapter}</span>}
            {block.verses.map((v, i) => (
              <VerseBody key={v.number} verse={v} translation={translation} decor={decorFor(v.number)} showNumber={showNumbers && !(drop && i === 0 && v.number === 1)} onMarker={onMarker} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** Two translations in verse-aligned rows, so each verse sits beside its counterpart. */
export function ParallelText({ left, right, leftId, rightId, showNumbers, decorFor, renderAfter, hasAfter, onMarker }: {
  left: ChapterData;
  right: ChapterData;
  leftId: string;
  rightId: string;
  showNumbers: boolean;
  decorFor: (v: number) => VerseDecor;
  renderAfter?: (v: number) => ReactNode;
  hasAfter?: (v: number) => boolean;
  onMarker?: (v: number) => void;
}) {
  const leftMap = new Map(left.verses.map((v) => [v.number, v]));
  const rightMap = new Map(right.verses.map((v) => [v.number, v]));
  const numbers = [...new Set([...leftMap.keys(), ...rightMap.keys()])].sort((a, b) => a - b);
  const cell = (v: DecodedVerse | undefined, id: string, n: number) => (
    <div className="parallel-cell">
      {v ? <VerseBody verse={v} translation={id} decor={decorFor(n)} showNumber={showNumbers} onMarker={onMarker} /> : null}
    </div>
  );
  return (
    <div className="parallel">
      {left.headings.length > 0 && <p className="chapter-heading">{left.headings.join(' ')}</p>}
      {numbers.map((n) => (
        <Fragment key={n}>
          <div className="parallel-row">
            {cell(leftMap.get(n), leftId, n)}
            {cell(rightMap.get(n), rightId, n)}
          </div>
          {hasAfter?.(n) && renderAfter?.(n)}
        </Fragment>
      ))}
    </div>
  );
}
