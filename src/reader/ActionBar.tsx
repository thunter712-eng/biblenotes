import { useState } from 'react';
import { useSettings } from '../app/settings.ts';
import { getVerseTexts } from '../bible/data.ts';
import { formatVerses, makeRef } from '../bible/refs.ts';
import { verseWords } from '../bible/layout.ts';
import type { HighlightColor, HighlightStyle } from '../db/schema.ts';
import { clearVerses, clearWords, createNote, highlightVerses, highlightWords, toggleBookmark } from '../db/study.ts';
import { Icon } from '../ui/icons.tsx';
import { IconButton, Segmented, toast } from '../ui/primitives.tsx';
import { useSelection } from './selection.ts';
import { useQuoteClipboard } from './quoteClipboard.ts';

const COLORS: HighlightColor[] = ['yellow', 'green', 'blue', 'pink', 'orange', 'purple'];

export function ActionBar({ book, chapter, abbr, onNoteCreated, onAddToPage, onInkNote }: {
  book: string;
  chapter: number;
  abbr: string;
  onNoteCreated: (id: string) => void;
  /** Present when a notebook page is open. */
  onAddToPage?: () => void;
  onInkNote?: () => void;
}) {
  const sel = useSelection();
  const translation = useSettings((s) => s.translation);
  const [palette, setPalette] = useState(false);
  const [style, setStyle] = useState<HighlightStyle>('highlight');
  if (!sel.verses.length) return null;

  const label = formatVerses(book, chapter, sel.verses);
  const wordMode = sel.wordVerse !== null;

  const finish = () => {
    setPalette(false);
    sel.clear();
  };

  const applyColor = async (color: HighlightColor) => {
    if (wordMode) {
      if (!sel.words) {
        toast('Drag across the words first');
        return;
      }
      await highlightWords(translation, book, chapter, sel.words.verse, { start: sel.words.start, end: sel.words.end }, color, style);
      sel.setWords(null);
      return;
    }
    await highlightVerses(book, chapter, sel.verses, color, style);
    finish();
  };

  const remove = async () => {
    if (wordMode && sel.words) {
      await clearWords(translation, book, chapter, sel.words.verse, { start: sel.words.start, end: sel.words.end });
      sel.setWords(null);
      return;
    }
    await clearVerses(book, chapter, sel.verses);
    finish();
  };

  const copy = async () => {
    const text = await getVerseTexts(translation, book, chapter, sel.verses);
    const quote = `${label} (${abbr})\n${text}`;
    useQuoteClipboard.getState().set({ book, chapter, verses: [...sel.verses], translation, abbr, text });
    try {
      await navigator.clipboard.writeText(quote);
      toast(onAddToPage ? 'Copied. Paste it on your page with the paste button.' : 'Copied');
    } catch {
      toast('Copying was blocked by the browser. The verses can still be pasted onto a notebook page.');
    }
    finish();
  };

  const typedNote = async () => {
    const note = await createNote('inline-text', book, chapter, sel.verses);
    finish();
    onNoteCreated(note.id);
  };

  const bookmark = async () => {
    const on = await toggleBookmark(makeRef(book, chapter, sel.verses[0]));
    toast(on ? `Bookmarked ${formatVerses(book, chapter, [sel.verses[0]])}` : 'Bookmark removed');
    finish();
  };

  const startWords = async () => {
    setPalette(true);
    sel.setWordVerse(sel.verses[0]);
    if (!verseWords(await getVerseTexts(translation, book, chapter, sel.verses)).length) sel.setWordVerse(null);
  };

  return (
    <div className="action-wrap" data-testid="action-bar">
      {palette && (
        <div className="palette" role="group" aria-label="Highlight">
          <Segmented<HighlightStyle> label="Highlight style" value={style} onChange={setStyle} options={[{ value: 'highlight', label: 'Marker' }, { value: 'underline', label: 'Underline' }, { value: 'strike', label: 'Strike' }]} />
          <div className="palette-colors">
            {COLORS.map((c) => (
              <button key={c} type="button" className={`color-dot dot-${c}`} aria-label={`${c} ${style}`} onClick={() => void applyColor(c)} />
            ))}
            <IconButton icon="trash" label="Remove highlights" onClick={() => void remove()} />
          </div>
          {wordMode && <p className="palette-hint">Drag across words, then pick a color.</p>}
        </div>
      )}
      <div className="action-bar" role="toolbar" aria-label={`Actions for ${label}`}>
        <span className="action-label">{label}</span>
        <button type="button" className={`action ${palette ? 'is-active' : ''}`} onClick={() => setPalette(!palette)}><Icon name="highlight" size={20} />Highlight</button>
        {sel.verses.length === 1 && (
          <button type="button" className={`action ${wordMode ? 'is-active' : ''}`} onClick={() => (wordMode ? sel.setWordVerse(null) : void startWords())}><Icon name="words" size={20} />Words</button>
        )}
        <button type="button" className="action" onClick={() => void typedNote()}><Icon name="note" size={20} />Typed note</button>
        {onInkNote && <button type="button" className="action" onClick={() => { onInkNote(); }}><Icon name="pen" size={20} />Handwritten note</button>}
        <button type="button" className="action" onClick={() => void copy()}><Icon name="copy" size={20} />Copy</button>
        <button type="button" className="action" onClick={() => void bookmark()}><Icon name="bookmark" size={20} />Bookmark</button>
        {onAddToPage && <button type="button" className="action" onClick={onAddToPage}><Icon name="paste" size={20} />Add to page</button>}
        <button type="button" className={`action ${sel.additive ? 'is-active' : ''}`} aria-pressed={sel.additive} onClick={() => sel.setAdditive(!sel.additive)}><Icon name="plus" size={20} />Pick separately</button>
        <IconButton icon="close" label="Clear selection" onClick={finish} />
      </div>
    </div>
  );
}
