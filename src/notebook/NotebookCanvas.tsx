import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor, JSONContent } from '@tiptap/core';
import { useShallow } from 'zustand/react/shallow';
import { newId } from '../app/ids.ts';
import { useSettings } from '../app/settings.ts';
import { formatVerses, makeRef } from '../bible/refs.ts';
import type { Page } from '../db/schema.ts';
import { updatePage } from '../db/library.ts';
import { EditorToolbar } from '../editor/EditorToolbar.tsx';
import { RichEditor } from '../editor/RichEditor.tsx';
import type { PageDocument } from '../ink/document.ts';
import { hasInkClipboard, InkEngine, type View } from '../ink/engine.ts';
import { InkToolbar } from '../ink/InkToolbar.tsx';
import { selectToolConfig, useInkTools, PEN_COLORS } from '../ink/toolStore.ts';
import { PAGE_WIDTH, isBox, type Bbox, type BoxObject, type PageObject, type TextBoxObject } from '../ink/types.ts';
import { useQuoteClipboard, type QuotePayload } from '../reader/quoteClipboard.ts';
import { Icon } from '../ui/icons.tsx';
import { IconButton, toast } from '../ui/primitives.tsx';
import { ImageView, QuoteView, TextBoxView } from './BoxViews.tsx';
import { storeImage } from './images.ts';
import { attachAutosave, flushDocument, loadDocument } from './pageStore.ts';

export interface NotebookHandle {
  /** Drops a verse quote. Without coordinates it lands at the center of the view. */
  addQuote: (q: QuotePayload, clientX?: number, clientY?: number) => void;
  flush: () => Promise<void>;
}

const NEW_TEXT_WIDTH = 360;
const QUOTE_WIDTH = 460;

function makeQuote(doc: PageDocument, q: QuotePayload, x: number, y: number): PageObject {
  const sorted = [...q.verses].sort((a, b) => a - b);
  return {
    type: 'quote', id: newId(), z: doc.allocZ(), x: Math.max(8, Math.min(PAGE_WIDTH - QUOTE_WIDTH - 8, x)), y: Math.max(8, y), w: QUOTE_WIDTH, h: 80,
    startRef: makeRef(q.book, q.chapter, sorted[0]), endRef: makeRef(q.book, q.chapter, sorted[sorted.length - 1]),
    label: formatVerses(q.book, q.chapter, sorted), abbr: q.abbr, text: q.text, scale: 1,
  };
}

export const NotebookCanvas = forwardRef<NotebookHandle, { page: Page; topRight?: React.ReactNode }>(function NotebookCanvas({ page, topRight }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<InkEngine | null>(null);
  const [doc, setDoc] = useState<PageDocument | null>(null);
  const [boxes, setBoxes] = useState<BoxObject[]>([]);
  const [selection, setSelection] = useState<{ ids: string[]; bbox: Bbox | null }>({ ids: [], bbox: null });
  const [, setViewTick] = useState(0);
  const [, setHistoryTick] = useState(0);
  const [editing, setEditing] = useState<{ id: string; original: TextBoxObject | null } | null>(null);
  const [toolbarSlot, setToolbarSlot] = useState<HTMLDivElement | null>(null);
  const closedAt = useRef(-Infinity);
  const fingerDraws = useSettings((s) => s.fingerDraws);
  const tool = useInkTools(useShallow(selectToolConfig));
  const quoteClip = useQuoteClipboard((s) => s.quote);
  const fileInput = useRef<HTMLInputElement>(null);
  const editingRef = useRef(editing);
  editingRef.current = editing;

  // Build the engine once this page's document has loaded.
  useEffect(() => {
    let cancelled = false;
    let engineLocal: InkEngine | null = null;
    let stopSave: (() => void) | null = null;
    let stopBoxes: (() => void) | null = null;
    void loadDocument(page.id).then((d) => {
      if (cancelled || !host.current) return;
      const refreshBoxes = () => setBoxes(d.objects.filter(isBox) as BoxObject[]);
      refreshBoxes();
      stopBoxes = d.onChange((e) => {
        if ([...e.added, ...e.removed].some(isBox)) refreshBoxes();
      });
      stopSave = attachAutosave(page.id, d);
      const e = new InkEngine(host.current, d, { template: page.template, paperColor: page.paperColor, sheets: page.sheets }, {
        fingerDraws: useSettings.getState().fingerDraws,
        onSelection: (ids, bbox) => setSelection({ ids, bbox }),
        onHistory: () => setHistoryTick((t) => t + 1),
        onView: (_v: View) => setViewTick((t) => t + 1),
        onMeta: (m) => void updatePage(page.id, { sheets: m.sheets }),
        onEditObject: (id) => {
          const o = d.get(id);
          if (o?.type === 'text') setEditing({ id, original: o });
        },
        onRequestText: (x, y) => {
          // A tap that closed a text box shouldn't also start a new one.
          if (editingRef.current || performance.now() - closedAt.current < 600) return;
          const box: TextBoxObject = { type: 'text', id: newId(), z: d.allocZ(), x: Math.max(4, Math.min(PAGE_WIDTH - NEW_TEXT_WIDTH - 4, x)), y, w: NEW_TEXT_WIDTH, h: 40, content: null, text: '', scale: 1 };
          d.applySilently([], [box]);
          setEditing({ id: box.id, original: null });
        },
      });
      e.setTool(selectToolConfig(useInkTools.getState()));
      engineLocal = e;
      (window as unknown as { __ink?: InkEngine }).__ink = e;
      setEngine(e);
      setDoc(d);
    });
    return () => {
      cancelled = true;
      stopBoxes?.();
      stopSave?.();
      engineLocal?.destroy();
      setEngine(null);
      setDoc(null);
    };
    // Paper changes are handled below without rebuilding the engine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id]);

  useEffect(() => { engine?.setTool(tool); }, [engine, tool]);
  useEffect(() => { engine?.setFingerDraws(fingerDraws); }, [engine, fingerDraws]);
  useEffect(() => {
    if (engine) engine.setMeta({ template: page.template, paperColor: page.paperColor, sheets: Math.max(page.sheets, engine.pageMeta.sheets) });
  }, [engine, page.template, page.paperColor, page.sheets]);

  // Keyboard shortcuts for desktop development.
  useEffect(() => {
    if (!engine) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) engine.redo(); else engine.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); engine.redo(); return; }
      if (mod) return;
      if ((e.key === 'Backspace' || e.key === 'Delete') && engine.selectedIds.length) { engine.deleteSelection(); return; }
      const tools: Record<string, Parameters<ReturnType<typeof useInkTools.getState>['patch']>[0]> = {
        p: { kind: 'pen' }, h: { kind: 'highlighter' }, e: { kind: 'eraser' }, x: { kind: 'pixel-eraser' }, l: { kind: 'lasso' }, t: { kind: 'text' }, s: { kind: 'shape' },
      };
      const patch = tools[e.key.toLowerCase()];
      if (patch) useInkTools.getState().patch(patch);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [engine]);

  useImperativeHandle(ref, () => ({
    addQuote: (q, clientX, clientY) => {
      if (!engine || !doc) return;
      const p = clientX !== undefined && clientY !== undefined ? engine.clientToPage(clientX, clientY) : engine.viewCenter();
      engine.addObjects([makeQuote(doc, q, p.x - (clientX !== undefined ? QUOTE_WIDTH / 2 : QUOTE_WIDTH / 2), p.y)]);
    },
    flush: async () => { if (doc) await flushDocument(page.id, doc); },
  }), [engine, doc, page.id]);

  const onHeight = useCallback((id: string, h: number) => {
    if (!doc) return;
    const o = doc.get(id);
    if (o && isBox(o) && o.type !== 'image' && Math.abs(o.h - h) > 1) doc.applySilently([o], [{ ...o, h }]);
  }, [doc]);

  const closeEditing = useCallback(() => {
    const ed = editingRef.current;
    if (!ed || !doc) return;
    setEditing(null);
    closedAt.current = performance.now();
    const current = doc.get(ed.id) as TextBoxObject | undefined;
    if (!current) return;
    if (!current.text.trim()) {
      doc.applySilently([current], []);
      if (ed.original) doc.pushHistory({ removed: [ed.original], added: [] });
    } else if (ed.original) {
      if (ed.original !== current) doc.pushHistory({ removed: [ed.original], added: [current] });
    } else {
      doc.pushHistory({ removed: [], added: [current] });
    }
    setHistoryTick((t) => t + 1);
  }, [doc]);

  const updateEditing = useCallback((patch: Partial<TextBoxObject>) => {
    const ed = editingRef.current;
    if (!ed || !doc) return;
    const o = doc.get(ed.id) as TextBoxObject | undefined;
    if (o) doc.applySilently([o], [{ ...o, ...patch }]);
  }, [doc]);

  const onImagePicked = async (file: File | undefined) => {
    if (!file || !engine || !doc) return;
    try {
      const img = await storeImage(file);
      const c = engine.viewCenter();
      const w = Math.min(420, img.width);
      const h = (w / img.width) * img.height;
      engine.addObjects([{ type: 'image', id: newId(), z: doc.allocZ(), x: Math.max(8, c.x - w / 2), y: c.y - h / 2, w, h, imageId: img.id }], true);
      useInkTools.getState().patch({ kind: 'lasso' });
    } catch {
      toast('That image could not be read. Try a JPEG or PNG.');
    }
  };

  const canPaste = hasInkClipboard() || !!quoteClip;
  const paste = () => {
    if (!engine || !doc) return;
    if (quoteClip) {
      engine.addObjects([makeQuote(doc, quoteClip, engine.viewCenter().x - QUOTE_WIDTH / 2, engine.viewCenter().y)]);
      useQuoteClipboard.setState({ quote: null });
    } else {
      engine.paste();
      useInkTools.getState().patch({ kind: 'lasso' });
    }
  };

  const selectionMenu = () => {
    if (!engine || !selection.bbox || !selection.ids.length) return null;
    const top = engine.pageToScreen(selection.bbox[0], selection.bbox[1]);
    const bottom = engine.pageToScreen(selection.bbox[2], selection.bbox[3]);
    const hostW = host.current?.clientWidth ?? 600;
    const hostH = host.current?.clientHeight ?? 600;
    const x = Math.max(8, Math.min(hostW - 320, top.x));
    const y = top.y > 66 ? top.y - 58 : Math.min(hostH - 60, bottom.y + 14);
    const inkSelected = selection.ids.some((id) => { const o = doc?.get(id); return o?.type === 'stroke' || o?.type === 'shape'; });
    return (
      <div className="sel-menu" data-engine-ignore role="toolbar" aria-label="Selection" style={{ left: x, top: y }}>
        <IconButton icon="copy" size={20} label="Copy selection" onClick={() => { engine.copySelection(); setHistoryTick((t) => t + 1); toast('Copied. Use the paste button to place it.'); }} />
        <IconButton icon="duplicate" size={20} label="Duplicate selection" onClick={() => engine.duplicateSelection()} />
        <IconButton icon="trash" size={20} label="Delete selection" onClick={() => engine.deleteSelection()} />
        {inkSelected && PEN_COLORS.map((c) => (
          <button key={c} type="button" className={`ink-swatch ${c === 'auto' ? 'is-auto' : ''}`} style={c === 'auto' ? undefined : { background: c }} aria-label={c === 'auto' ? 'Recolor to default ink' : `Recolor to ${c}`} onClick={() => engine.recolorSelection(c)} />
        ))}
      </div>
    );
  };

  const editingObject = editing && doc ? (doc.get(editing.id) as TextBoxObject | undefined) : undefined;

  return (
    <div className="notebook-canvas" data-page-drop>
      <InkToolbar
        canUndo={!!doc?.canUndo} canRedo={!!doc?.canRedo}
        onUndo={() => { engine?.undo(); setHistoryTick((t) => t + 1); }} onRedo={() => { engine?.redo(); setHistoryTick((t) => t + 1); }}
        onImage={() => fileInput.current?.click()}
        extra={<>
          <span className="ink-sep" />
          <IconButton icon="paste" label="Paste" disabled={!canPaste} onClick={paste} />
          {topRight}
        </>}
      />
      <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => { void onImagePicked(e.target.files?.[0]); e.target.value = ''; }} />
      <div className="page-ed-toolbar" data-editor-chrome ref={setToolbarSlot} />
      <div className="ink-host" ref={host} data-testid="notebook-canvas" />
      {engine && createPortal(
        <>
          {boxes.map((o) => {
            if (o.type === 'text') return <TextBoxView key={o.id} o={o} hidden={editing?.id === o.id} onHeight={onHeight} />;
            if (o.type === 'quote') return <QuoteView key={o.id} o={o} onHeight={onHeight} />;
            return <ImageView key={o.id} o={o} />;
          })}
        </>,
        engine.objectLayer,
      )}
      {engine && editingObject && createPortal(
        <TextBoxEditor o={editingObject} engine={engine} onChange={updateEditing} onClose={closeEditing} toolbarSlot={toolbarSlot} />,
        engine.topLayer,
      )}
      {engine && createPortal(
        <>
          {selectionMenu()}
          <button type="button" className="add-sheet" data-engine-ignore style={{ top: Math.min(engine.pageToScreen(0, engine.pageHeight).y + 12, (host.current?.clientHeight ?? 9999) + 100) }} onClick={() => engine.addSheet()}>
            <Icon name="plus" size={18} />Add page
          </button>
        </>,
        engine.uiLayer,
      )}
    </div>
  );
});

/** The live editor for one text box, with a drag grip and a width handle. */
function TextBoxEditor({ o, engine, onChange, onClose, toolbarSlot }: {
  o: TextBoxObject;
  engine: InkEngine;
  onChange: (p: Partial<TextBoxObject>) => void;
  onClose: () => void;
  toolbarSlot: HTMLDivElement | null;
}) {
  const [initial] = useState(o.content);
  // The on-screen keyboard covers the lower half of the screen, so bring the box up above it.
  useEffect(() => { engine.bringIntoUpperView(o.y); }, [engine, o.id]);
  const drag = useRef<{ kind: 'move' | 'width'; x: number; y: number; ox: number; oy: number; ow: number } | null>(null);
  const startDrag = (e: React.PointerEvent, kind: 'move' | 'width') => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { kind, x: e.clientX, y: e.clientY, ox: o.x, oy: o.y, ow: o.w };
  };
  const moveDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const s = engine.view.scale;
    const dx = (e.clientX - d.x) / s;
    const dy = (e.clientY - d.y) / s;
    if (d.kind === 'move') onChange({ x: d.ox + dx, y: d.oy + dy });
    else onChange({ w: Math.max(90, d.ow + dx) });
  };
  const endDrag = () => { drag.current = null; };

  return (
    <div className="page-box-edit" data-engine-ignore style={{ left: o.x, top: o.y, width: o.w, fontSize: 18 * o.scale }}>
      <div className="box-grip" role="button" aria-label="Drag to move" onPointerDown={(e) => startDrag(e, 'move')} onPointerMove={moveDrag} onPointerUp={endDrag}><Icon name="grip" size={18} /></div>
      <div className="box-width" role="button" aria-label="Drag to change width" onPointerDown={(e) => startDrag(e, 'width')} onPointerMove={moveDrag} onPointerUp={endDrag} />
      <RichEditor
        content={initial} autoFocus placeholder="Type here"
        renderToolbar={(editor: Editor) => (toolbarSlot ? createPortal(<EditorToolbar editor={editor} />, toolbarSlot) : null)}
        onChange={(json: JSONContent, text: string) => onChange({ content: json, text })}
        onBlurOutside={onClose}
      />
    </div>
  );
}
