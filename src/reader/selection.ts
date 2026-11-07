import { create } from 'zustand';

export interface SelectionState {
  verses: number[];
  anchor: number | null;
}

export const EMPTY_SELECTION: SelectionState = { verses: [], anchor: null };

const range = (a: number, b: number) => {
  const out: number[] = [];
  for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.push(i);
  return out;
};

const sortedUnion = (a: number[], b: number[]) => [...new Set([...a, ...b])].sort((x, y) => x - y);

/**
 * Tap rules:
 * - first tap selects a verse
 * - tapping another verse extends a range from the anchor
 * - tapping a selected verse removes it, which is one way to get a non-contiguous selection
 * - additive mode ("Pick separately", or Cmd/Ctrl-click) toggles single verses
 */
export function applyTap(s: SelectionState, verse: number, additive: boolean, knownVerses?: Set<number>): SelectionState {
  if (!s.verses.length) return { verses: [verse], anchor: verse };
  if (s.verses.includes(verse)) {
    const verses = s.verses.filter((v) => v !== verse);
    return verses.length ? { verses, anchor: s.anchor === verse ? verses[verses.length - 1] : s.anchor } : EMPTY_SELECTION;
  }
  if (additive) return { verses: sortedUnion(s.verses, [verse]), anchor: verse };
  const span = range(s.anchor ?? verse, verse).filter((v) => !knownVerses || knownVerses.has(v));
  return { verses: sortedUnion(s.verses, span), anchor: s.anchor };
}

/** A drag selects from its start verse to the verse under the pointer, on top of what `base` already held. */
export function applyDrag(base: number[], from: number, to: number, knownVerses?: Set<number>): SelectionState {
  const span = range(from, to).filter((v) => !knownVerses || knownVerses.has(v));
  return { verses: sortedUnion(base, span), anchor: from };
}

export interface WordSelection {
  verse: number;
  start: number;
  end: number;
}

interface SelectionStore extends SelectionState {
  additive: boolean;
  /** Word-picking mode: set to the verse being worked on. */
  wordVerse: number | null;
  words: WordSelection | null;
  setSelection: (s: SelectionState) => void;
  setAdditive: (on: boolean) => void;
  setWordVerse: (v: number | null) => void;
  setWords: (w: WordSelection | null) => void;
  clear: () => void;
}

export const useSelection = create<SelectionStore>((set) => ({
  ...EMPTY_SELECTION,
  additive: false,
  wordVerse: null,
  words: null,
  setSelection: (s) => set(s),
  setAdditive: (additive) => set({ additive }),
  setWordVerse: (wordVerse) => set({ wordVerse, words: null }),
  setWords: (words) => set({ words }),
  clear: () => set({ ...EMPTY_SELECTION, additive: false, wordVerse: null, words: null }),
}));
