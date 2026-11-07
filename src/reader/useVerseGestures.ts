import { useEffect, useRef, type RefObject } from 'react';

const LONG_PRESS_MS = 320;
const MOVE_TOLERANCE = 10;

export interface VerseGestureHandlers {
  onTap: (verse: number, additive: boolean) => void;
  onTapEmpty: () => void;
  /** A drag across verses. `begin` is true once, for the first move. */
  onDragSelect: (from: number, to: number, begin: boolean) => void;
  onDragEnd: () => void;
  /** Word mode, inside the verse being edited. */
  onWordDrag: (verse: number, from: number, to: number) => void;
  /** Return true to take over as a verse-quote drag. Pointer positions then go to onQuoteMove. */
  shouldQuoteDrag: (verse: number) => boolean;
  onQuoteMove: (x: number, y: number) => void;
  onQuoteDrop: (x: number, y: number) => void;
  onHapticStart?: () => void;
}

const verseAt = (el: Element | null): number | null => {
  const v = el?.closest?.('[data-v]') as HTMLElement | null;
  return v ? +v.dataset.v! : null;
};

/**
 * One gesture model for all three input types:
 * - Finger: tap selects, a plain drag scrolls, press-and-hold then drag selects.
 * - Pencil and mouse: tap selects, a drag selects at once (neither of them scrolls).
 * Pressing an already-selected verse and dragging picks up a quote for the notebook.
 */
export function useVerseGestures(ref: RefObject<HTMLElement | null>, handlers: VerseGestureHandlers) {
  const h = useRef(handlers);
  h.current = handlers;

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    interface Press {
      id: number;
      type: string;
      x: number;
      y: number;
      verse: number | null;
      word: { verse: number; index: number } | null;
      additive: boolean;
      mode: 'pending' | 'held' | 'select' | 'quote' | 'word';
      timer: number;
    }
    let press: Press | null = null;

    const beginDrag = (p: Press) => {
      if (p.verse === null) return;
      if (h.current.shouldQuoteDrag(p.verse)) {
        p.mode = 'quote';
      } else {
        p.mode = 'select';
        h.current.onDragSelect(p.verse, p.verse, true);
      }
    };

    const onDown = (e: PointerEvent) => {
      if (press || e.button > 0) return;
      const target = e.target as HTMLElement;
      if (target.closest('button, a, input, select, .rich-editor, .inline-note')) return;
      const wordEl = target.closest('.is-wordmode [data-w]') as HTMLElement | null;
      const verse = verseAt(target);
      press = {
        id: e.pointerId, type: e.pointerType, x: e.clientX, y: e.clientY, verse,
        word: wordEl && verse !== null ? { verse, index: +wordEl.dataset.w! } : null,
        additive: e.metaKey || e.ctrlKey,
        mode: 'pending', timer: 0,
      };
      if (press.word) {
        press.mode = 'word';
        h.current.onWordDrag(press.word.verse, press.word.index, press.word.index);
        e.preventDefault();
      } else if (e.pointerType === 'touch' && verse !== null) {
        const p = press;
        p.timer = window.setTimeout(() => {
          if (press !== p || p.mode !== 'pending') return;
          p.mode = 'held';
          h.current.onHapticStart?.();
          beginDrag(p);
        }, LONG_PRESS_MS);
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!press || e.pointerId !== press.id) return;
      const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y) > MOVE_TOLERANCE;
      if (press.mode === 'pending') {
        if (!moved) return;
        if (press.type === 'touch') {
          clearTimeout(press.timer);
          press = null; // A plain finger drag belongs to the browser's scrolling.
          return;
        }
        beginDrag(press);
      }
      const under = document.elementFromPoint(e.clientX, e.clientY);
      if (press.mode === 'select' && press.verse !== null) {
        const v = verseAt(under);
        if (v !== null) h.current.onDragSelect(press.verse, v, false);
      } else if (press.mode === 'quote') {
        h.current.onQuoteMove(e.clientX, e.clientY);
      } else if (press.mode === 'word' && press.word) {
        const wordEl = under?.closest?.('.is-wordmode [data-w]') as HTMLElement | null;
        if (wordEl) h.current.onWordDrag(press.word.verse, press.word.index, +wordEl.dataset.w!);
      }
    };

    const end = (e: PointerEvent, cancelled: boolean) => {
      if (!press || e.pointerId !== press.id) return;
      const p = press;
      press = null;
      clearTimeout(p.timer);
      if (cancelled) {
        if (p.mode === 'select') h.current.onDragEnd();
        return;
      }
      if (p.mode === 'pending') {
        if (p.verse !== null) h.current.onTap(p.verse, p.additive);
        else if (!(e.target as HTMLElement).closest?.('button, a, input, select, .rich-editor, .inline-note')) h.current.onTapEmpty();
      } else if (p.mode === 'select') {
        h.current.onDragEnd();
      } else if (p.mode === 'quote') {
        h.current.onQuoteDrop(e.clientX, e.clientY);
      }
    };
    const onUp = (e: PointerEvent) => end(e, false);
    const onCancel = (e: PointerEvent) => end(e, true);

    // Stop iOS starting a scroll once a long press has claimed the gesture, and always for a Pencil,
    // whose drags select. iOS only asks once, on the first move, so this can't wait for the threshold.
    const onTouchMove = (e: TouchEvent) => {
      if (press && (press.mode !== 'pending' || press.type === 'pen') && e.cancelable) e.preventDefault();
    };
    const noContext = (e: Event) => e.preventDefault();

    root.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    root.addEventListener('touchmove', onTouchMove, { passive: false });
    root.addEventListener('contextmenu', noContext);
    return () => {
      root.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      root.removeEventListener('touchmove', onTouchMove);
      root.removeEventListener('contextmenu', noContext);
    };
  }, [ref]);
}
