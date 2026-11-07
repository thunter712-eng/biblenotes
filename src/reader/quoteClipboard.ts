import { create } from 'zustand';

export interface QuotePayload {
  book: string;
  chapter: number;
  verses: number[];
  translation: string;
  abbr: string;
  text: string;
}

/** The last copied verses. Pasting onto a page turns them into a verse quote block. */
export const useQuoteClipboard = create<{ quote: QuotePayload | null; set: (q: QuotePayload) => void }>((set) => ({
  quote: null,
  set: (quote) => set({ quote }),
}));
