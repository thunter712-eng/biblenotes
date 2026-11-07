import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Icon } from '../ui/icons.tsx';
import { IconButton } from '../ui/primitives.tsx';
import { HIGHLIGHT_COLORS, PEN_COLORS, useInkTools, type Favorite } from './toolStore.ts';
import type { Brush, ShapeKind, ToolKind } from './types.ts';

const BRUSHES: { value: Brush; label: string }[] = [
  { value: 'ballpoint', label: 'Ballpoint' },
  { value: 'fountain', label: 'Fountain' },
  { value: 'pencil', label: 'Pencil' },
];
const SHAPES: { value: ShapeKind; label: string }[] = [
  { value: 'line', label: 'Line' },
  { value: 'rect', label: 'Rectangle' },
  { value: 'ellipse', label: 'Ellipse' },
  { value: 'arrow', label: 'Arrow' },
];
const WIDTH_RANGE: Partial<Record<ToolKind, [number, number, number]>> = {
  pen: [0.8, 10, 0.1],
  highlighter: [8, 44, 1],
  eraser: [4, 48, 1],
  'pixel-eraser': [4, 48, 1],
  shape: [1, 10, 0.5],
};

function Swatch({ color, active, label, onClick }: { color: string; active: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" className={`ink-swatch ${color === 'auto' ? 'is-auto' : ''} ${active ? 'is-active' : ''}`} style={color === 'auto' ? undefined : { background: color }} aria-label={label} aria-pressed={active} onClick={onClick} />
  );
}

const sameFav = (a: Favorite, b: Favorite) => a.kind === b.kind && a.brush === b.brush && a.color === b.color && Math.abs(a.width - b.width) < 0.01;

export function InkToolbar({ compact, canUndo, canRedo, onUndo, onRedo, onImage, extra }: {
  compact?: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onImage?: () => void;
  extra?: React.ReactNode;
}) {
  const t = useInkTools(useShallow((s) => s));
  const [open, setOpen] = useState(false);
  const usesColor = t.kind === 'pen' || t.kind === 'highlighter' || t.kind === 'shape';
  const color = t.kind === 'highlighter' ? t.hlColor : t.kind === 'shape' ? t.shapeColor : t.penColor;
  const setColor = (c: string) => t.patch(t.kind === 'highlighter' ? { hlColor: c } : t.kind === 'shape' ? { shapeColor: c } : { penColor: c });
  const width = t.kind === 'highlighter' ? t.hlWidth : t.kind === 'shape' ? t.shapeWidth : t.kind === 'pen' ? t.penWidth : t.eraserWidth;
  const setWidth = (w: number) => t.patch(t.kind === 'highlighter' ? { hlWidth: w } : t.kind === 'shape' ? { shapeWidth: w } : t.kind === 'pen' ? { penWidth: w } : { eraserWidth: w });
  const palette = t.kind === 'highlighter' ? HIGHLIGHT_COLORS : PEN_COLORS;
  const range = WIDTH_RANGE[t.kind];

  /** Tapping the active tool opens its options. Tapping another tool switches to it. */
  const pick = (kind: ToolKind) => {
    if (t.kind === kind) setOpen(!open);
    else {
      t.patch({ kind });
      setOpen(false);
    }
  };

  const current: Favorite | null = t.kind === 'pen' || t.kind === 'highlighter' ? { kind: t.kind, brush: t.kind === 'pen' ? t.brush : 'highlighter', color, width } : null;
  const isFavorite = !!current && t.favorites.some((f) => sameFav(f, current));
  const toggleFavorite = () => {
    if (!current) return;
    t.patch({ favorites: isFavorite ? t.favorites.filter((f) => !sameFav(f, current)) : [...t.favorites, current] });
  };
  const applyFavorite = (f: Favorite) => {
    if (f.kind === 'highlighter') t.patch({ kind: 'highlighter', hlColor: f.color, hlWidth: f.width });
    else t.patch({ kind: 'pen', brush: f.brush, penColor: f.color, penWidth: f.width });
  };

  return (
    <div className="ink-toolbar" data-editor-chrome>
      <div className="ink-toolbar-row" role="toolbar" aria-label="Ink tools">
        <IconButton icon="pen" label="Pen" active={t.kind === 'pen'} onClick={() => pick('pen')} />
        <IconButton icon="highlight" label="Highlighter" active={t.kind === 'highlighter'} onClick={() => pick('highlighter')} />
        <IconButton icon="eraser" label="Stroke eraser" active={t.kind === 'eraser'} onClick={() => pick('eraser')} />
        <IconButton icon="eraserPixel" label="Pixel eraser" active={t.kind === 'pixel-eraser'} onClick={() => pick('pixel-eraser')} />
        {!compact && (
          <>
            <IconButton icon="lasso" label="Lasso select" active={t.kind === 'lasso'} onClick={() => pick('lasso')} />
            <IconButton icon="textBox" label="Text box" active={t.kind === 'text'} onClick={() => pick('text')} />
            <IconButton icon="shape" label="Shapes" active={t.kind === 'shape'} onClick={() => pick('shape')} />
            {onImage && <IconButton icon="image" label="Insert image" onClick={onImage} />}
          </>
        )}
        <span className="ink-sep" />
        <IconButton icon="undo" label="Undo" disabled={!canUndo} onClick={onUndo} />
        <IconButton icon="redo" label="Redo" disabled={!canRedo} onClick={onRedo} />
        {usesColor && (
          <>
            <span className="ink-sep" />
            {palette.map((c) => <Swatch key={c} color={c} active={c === color} label={c === 'auto' ? 'Default ink' : `Color ${c}`} onClick={() => setColor(c)} />)}
          </>
        )}
        {extra}
      </div>
      {!compact && (t.kind === 'pen' || t.kind === 'highlighter') && (
        <div className="ink-toolbar-row ink-favorites" role="group" aria-label="Favorite tools">
          {t.favorites.map((f, i) => (
            <button key={i} type="button" className={`ink-fav ${current && sameFav(f, current) ? 'is-active' : ''}`} aria-label={`Favorite ${f.brush} pen`} onClick={() => applyFavorite(f)}>
              <Icon name={f.kind === 'highlighter' ? 'highlight' : 'pen'} size={16} />
              <span className={`ink-fav-dot ${f.color === 'auto' ? 'is-auto' : ''}`} style={f.color === 'auto' ? undefined : { background: f.color, width: 6 + Math.min(10, f.width), height: 6 + Math.min(10, f.width) }} />
            </button>
          ))}
          <button type="button" className="ink-fav-add" onClick={toggleFavorite}>{isFavorite ? 'Unpin' : 'Pin this pen'}</button>
          {range && <span className="ink-size-hint">Tap the active tool for size and options</span>}
        </div>
      )}
      {open && (
        <div className="ink-options" role="group" aria-label="Tool options">
          {t.kind === 'pen' && (
            <div className="ink-opt-row">
              {BRUSHES.map((b) => <button key={b.value} type="button" className={`chip ${t.brush === b.value ? 'is-active' : ''}`} onClick={() => t.patch({ brush: b.value })}>{b.label}</button>)}
            </div>
          )}
          {t.kind === 'shape' && (
            <div className="ink-opt-row">
              {SHAPES.map((s) => <button key={s.value} type="button" className={`chip ${t.shape === s.value ? 'is-active' : ''}`} onClick={() => t.patch({ shape: s.value })}>{s.label}</button>)}
            </div>
          )}
          {range && (
            <label className="ink-opt-row">
              <span>Size</span>
              <input type="range" min={range[0]} max={range[1]} step={range[2]} value={width} onChange={(e) => setWidth(+e.target.value)} />
              <span className="ink-size-value">{width.toFixed(range[2] < 1 ? 1 : 0)}</span>
            </label>
          )}
          {usesColor && (
            <label className="ink-opt-row">
              <span>Custom color</span>
              <input type="color" value={color === 'auto' ? '#1b1f2b' : color} onChange={(e) => {
                setColor(e.target.value);
                if (!t.customColors.includes(e.target.value)) t.patch({ customColors: [e.target.value, ...t.customColors].slice(0, 8) });
              }} />
              {t.customColors.map((c) => <Swatch key={c} color={c} active={c === color} label={`Color ${c}`} onClick={() => setColor(c)} />)}
            </label>
          )}
          {(t.kind === 'lasso' || t.kind === 'text') && <p className="muted ink-opt-note">{t.kind === 'lasso' ? 'Circle ink or tap a text box, then move, resize, copy, recolor or delete it.' : 'Tap the page to add a text box. Tap a text box to edit it.'}</p>}
        </div>
      )}
    </div>
  );
}
