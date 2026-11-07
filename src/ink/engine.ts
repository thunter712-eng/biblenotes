import { newId } from '../app/ids.ts';
import { drawInk, drawShape, fillStroke, strokePath, resolveInk } from './brushes.ts';
import type { PageDocument, Op } from './document.ts';
import { cutStroke, shapeToStroke } from './erase.ts';
import { bboxesIntersect, inkHitsCircle, objectBbox, objectInLasso, pointsBbox, strokePad, transformObject, unionBbox, type Transform } from './geometry.ts';
import { drawPaper } from './paper.ts';
import { recognizeShape, type RecognizedShape } from './recognize.ts';
import {
  PAGE_WIDTH, SHEET_HEIGHT, isBox, isHighlighter,
  type Bbox, type PageMeta, type PageObject, type ShapeKind, type ShapeObject, type StrokeObject, type ToolConfig,
} from './types.ts';

export interface View {
  scale: number;
  x: number;
  y: number;
}

export interface EngineStats {
  pointerType: string;
  pressure: number;
  tiltX: number;
  tiltY: number;
  coalesced: number;
  predicted: number;
  liveFrameMs: number;
  cacheRenderMs: number;
  desynchronized: boolean;
  strokes: number;
}

export interface EngineEvents {
  onView?: (view: View) => void;
  onSelection?: (ids: string[], bbox: Bbox | null) => void;
  onHistory?: () => void;
  onRequestText?: (x: number, y: number) => void;
  onEditObject?: (id: string) => void;
  onMeta?: (meta: PageMeta) => void;
  onStats?: (stats: EngineStats) => void;
  onPenSeen?: () => void;
}

export interface EngineOptions extends EngineEvents {
  /** Inline ink notes: fixed at fit width, and a finger passes through to scroll the reader. */
  embedded?: boolean;
  fingerDraws?: boolean;
}

const PALM_WINDOW_MS = 500;
const PALM_RADIUS = 34;
const PAN_THRESHOLD = 8;
const HOLD_SNAP_MS = 480;
const HOLD_TOLERANCE = 4;
const MAX_CANVAS_AREA = 16_000_000;
const SELECT_HANDLE = 12;
const TAP_DISTANCE = 6;

const pressureCurve = (p: number) => Math.pow(Math.max(0.02, p), 0.72);

type Gesture =
  | { k: 'stroke'; id: number; pts: number[]; sim: boolean; t0: number; holdX: number; holdY: number; holdTimer: number; snapped: RecognizedShape | null; downTime: number; touch: boolean }
  | { k: 'erase'; id: number; pixel: boolean; lastX: number; lastY: number; x: number; y: number; removed: Map<string, PageObject>; added: Map<string, PageObject> }
  | { k: 'lasso'; id: number; poly: number[] }
  | { k: 'shape'; id: number; x1: number; y1: number; x2: number; y2: number }
  | { k: 'tap'; id: number; x: number; y: number; cx: number; cy: number }
  | { k: 'move'; id: number; startX: number; startY: number; originals: PageObject[]; m: Transform }
  | { k: 'resize'; id: number; ax: number; ay: number; box: Bbox; originals: PageObject[]; m: Transform };

interface Layer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

/** Module-level so that a lasso copy can be pasted onto another page. */
let inkClipboard: PageObject[] = [];
export const hasInkClipboard = () => inkClipboard.length > 0;

function makeLayer(parent: HTMLElement, cls: string, attrs?: CanvasRenderingContext2DSettings): Layer {
  const canvas = document.createElement('canvas');
  canvas.className = `ink-layer ${cls}`;
  parent.appendChild(canvas);
  const ctx = canvas.getContext('2d', attrs) ?? canvas.getContext('2d')!;
  return { canvas, ctx };
}

/**
 * The ink engine. It never goes through React: pointer events feed points straight to a live canvas.
 *
 * Layers, bottom to top:
 *   paper      cached, with overscan
 *   objects    DOM: text boxes, quotes, images (a React portal)
 *   hl         cached highlighter strokes, blended so they tint what's beneath without covering ink
 *   ink        cached strokes and shapes
 *   live       the stroke being drawn, plus lasso and selection chrome. Sized to the viewport.
 *   top, ui    DOM layers for the text being edited and for the selection menu
 *
 * Cached layers are moved by CSS transform while a gesture runs, and repainted when it ends or when
 * the view leaves the overscan area. Only the live stroke is redrawn per frame.
 */
export class InkEngine {
  readonly objectLayer: HTMLDivElement;
  readonly topLayer: HTMLDivElement;
  readonly uiLayer: HTMLDivElement;

  private paper: Layer;
  private hl: Layer;
  private ink: Layer;
  private live: Layer;

  view: View = { scale: 1, x: 0, y: 0 };
  private cacheView: View = { scale: 1, x: 0, y: 0 };
  private vw = 0;
  private vh = 0;
  private mx = 0;
  private my = 0;
  private dpr = 1;
  private zoom = 1;
  private rect = { left: 0, top: 0 };

  private tool: ToolConfig = { kind: 'pen', brush: 'ballpoint', color: 'auto', width: 2.5, shape: 'line' };
  private gesture: Gesture | null = null;
  private predicted: number[] = [];

  // Touch handling
  private touches = new Map<number, { x: number; y: number }>();
  private rejected = new Set<number>();
  private lastPenTime = -Infinity;
  private touchMode: null | 'pending' | 'pan' | 'pinch' = null;
  private touchStartView: View | null = null;
  private touchStartTime = 0;
  private panLast = { x: 0, y: 0, t: 0 };
  private velocity = { x: 0, y: 0 };
  private pinchStart = { dist: 1, scale: 1, ax: 0, ay: 0 };
  private momentumRaf = 0;

  private selection = new Set<string>();
  private selectionBox: Bbox | null = null;
  private hidden = new Set<string>();

  private rafId = 0;
  private liveDirty = false;
  private cacheFullDirty = false;
  private cacheRects: Bbox[] = [];
  private lastEvents = { coalesced: 0, predicted: 0, pressure: 0, tiltX: 0, tiltY: 0, type: '' };
  private liveFrameMs = 0;
  private cacheRenderMs = 0;
  private statsAt = 0;
  private unsubDoc: () => void;
  private resizeObserver: ResizeObserver;
  private cleanups: (() => void)[] = [];
  private destroyed = false;

  constructor(
    private readonly root: HTMLElement,
    private doc: PageDocument,
    private meta: PageMeta,
    private readonly options: EngineOptions = {},
  ) {
    root.classList.add('ink-root');
    if (options.embedded) root.classList.add('is-embedded');
    this.paper = makeLayer(root, 'ink-paper', { alpha: false });
    this.objectLayer = document.createElement('div');
    this.objectLayer.className = 'ink-objects';
    root.appendChild(this.objectLayer);
    this.hl = makeLayer(root, 'ink-hl');
    this.ink = makeLayer(root, 'ink-ink');
    this.live = makeLayer(root, 'ink-live', { desynchronized: true });
    this.topLayer = document.createElement('div');
    this.topLayer.className = 'ink-top';
    root.appendChild(this.topLayer);
    this.uiLayer = document.createElement('div');
    this.uiLayer.className = 'ink-ui';
    root.appendChild(this.uiLayer);
    this.syncBlendMode();

    this.unsubDoc = this.doc.onChange((e) => this.onDocChange(e));
    this.bindInput();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(root);
    this.resize();
  }

  destroy() {
    this.destroyed = true;
    this.unsubDoc();
    this.resizeObserver.disconnect();
    cancelAnimationFrame(this.rafId);
    cancelAnimationFrame(this.momentumRaf);
    this.cleanups.forEach((c) => c());
    this.root.replaceChildren();
    this.root.classList.remove('ink-root', 'is-embedded');
  }

  // ---------------------------------------------------------------- public API

  setTool(tool: ToolConfig) {
    if (this.selection.size && tool.kind !== 'lasso') this.clearSelection();
    this.tool = tool;
  }

  setFingerDraws(on: boolean) {
    this.options.fingerDraws = on;
  }

  get pageMeta() { return this.meta; }
  get document() { return this.doc; }
  get pageHeight() { return this.meta.sheets * SHEET_HEIGHT; }

  setMeta(meta: PageMeta) {
    this.meta = meta;
    this.syncBlendMode();
    this.clampView();
    this.scheduleFull();
  }

  /** Swaps in another page without rebuilding the canvases. */
  setDocument(doc: PageDocument, meta: PageMeta) {
    this.abortGesture();
    this.clearSelection();
    this.unsubDoc();
    this.doc = doc;
    this.meta = meta;
    this.unsubDoc = doc.onChange((e) => this.onDocChange(e));
    this.syncBlendMode();
    this.zoom = 1;
    this.fitWidth(true);
    this.renderCache();
    this.options.onHistory?.();
  }

  undo() {
    this.abortGesture();
    this.clearSelection();
    this.doc.undo();
    this.options.onHistory?.();
  }

  redo() {
    this.abortGesture();
    this.clearSelection();
    this.doc.redo();
    this.options.onHistory?.();
  }

  addSheet() {
    this.meta = { ...this.meta, sheets: this.meta.sheets + 1 };
    this.options.onMeta?.(this.meta);
    this.clampView();
    this.scheduleFull();
  }

  /** Adds objects as one undoable step. */
  addObjects(objs: PageObject[], select = false) {
    this.doc.commit({ removed: [], added: objs });
    this.growFor(objs);
    this.options.onHistory?.();
    if (select) this.setSelection(objs.map((o) => o.id));
  }

  /** The page point at the center of the visible area. */
  viewCenter(): { x: number; y: number } {
    return { x: (this.vw / 2 - this.view.x) / this.view.scale, y: (this.vh / 2 - this.view.y) / this.view.scale };
  }

  clientToPage(clientX: number, clientY: number) {
    const r = this.root.getBoundingClientRect();
    return { x: (clientX - r.left - this.view.x) / this.view.scale, y: (clientY - r.top - this.view.y) / this.view.scale };
  }

  pageToScreen(x: number, y: number) {
    return { x: x * this.view.scale + this.view.x, y: y * this.view.scale + this.view.y };
  }

  /** Pans so that a page position sits in the upper part of the view, if it's currently lower. */
  bringIntoUpperView(pageY: number) {
    const y = pageY * this.view.scale + this.view.y;
    const target = this.vh * 0.18;
    if (y <= this.vh * 0.4 || this.options.embedded) return;
    this.view.y -= y - target;
    this.viewChanged();
    this.scheduleFull();
  }

  setSelection(ids: string[]) {
    this.selection = new Set(ids);
    this.refreshSelectionBox();
    this.emitSelection();
    this.requestLive();
  }

  clearSelection() {
    if (!this.selection.size) return;
    this.selection.clear();
    this.selectionBox = null;
    this.emitSelection();
    this.requestLive();
  }

  get selectedIds() { return [...this.selection]; }

  deleteSelection() {
    const removed = this.selectedObjects();
    this.clearSelection();
    this.doc.commit({ removed, added: [] });
    this.options.onHistory?.();
  }

  copySelection() {
    inkClipboard = this.selectedObjects();
  }

  duplicateSelection() {
    this.copySelection();
    this.paste();
  }

  /** Pastes the lasso clipboard near the view center, or offset from the originals. */
  paste() {
    if (!inkClipboard.length) return;
    const box = unionBbox(inkClipboard.map(objectBbox))!;
    const center = this.viewCenter();
    const onThisView = box[0] < center.x && center.x < box[2] && box[1] < center.y && center.y < box[3];
    const tx = onThisView ? 24 : center.x - (box[0] + box[2]) / 2;
    const ty = onThisView ? 24 : center.y - (box[1] + box[3]) / 2;
    const copies = inkClipboard.map((o) => ({ ...transformObject(o, { sx: 1, sy: 1, tx, ty }), id: newId(), z: this.doc.allocZ() }));
    this.addObjects(copies, true);
  }

  recolorSelection(color: string) {
    const originals = this.selectedObjects().filter((o) => o.type === 'stroke' || o.type === 'shape');
    const updated = originals.map((o) => ({ ...o, color } as PageObject));
    this.doc.commit({ removed: originals, added: updated });
    this.options.onHistory?.();
  }

  /** Current stats, for the ink test page. */
  stats(): EngineStats {
    const attrs = this.live.ctx.getContextAttributes?.() as (CanvasRenderingContext2DSettings | undefined);
    return {
      pointerType: this.lastEvents.type,
      pressure: this.lastEvents.pressure,
      tiltX: this.lastEvents.tiltX,
      tiltY: this.lastEvents.tiltY,
      coalesced: this.lastEvents.coalesced,
      predicted: this.lastEvents.predicted,
      liveFrameMs: this.liveFrameMs,
      cacheRenderMs: this.cacheRenderMs,
      desynchronized: !!attrs?.desynchronized,
      strokes: this.doc.size,
    };
  }

  /** Repaints everything now and returns how long it took. Used by the benchmark. */
  benchmarkFullRender(): number {
    const start = performance.now();
    this.renderCache();
    return performance.now() - start;
  }

  // ---------------------------------------------------------------- view

  private get fit() { return this.vw / PAGE_WIDTH; }

  private fitWidth(toTop = false) {
    const scale = this.fit * this.zoom;
    this.view.scale = scale;
    if (toTop) {
      this.view.x = 0;
      this.view.y = this.options.embedded ? 0 : 8;
    }
    this.clampView();
  }

  private clampView() {
    const v = this.view;
    if (this.options.embedded) {
      v.x = 0;
      v.y = 0;
      v.scale = this.fit;
      return;
    }
    const w = PAGE_WIDTH * v.scale;
    const h = this.pageHeight * v.scale;
    v.x = w <= this.vw ? (this.vw - w) / 2 : Math.min(40, Math.max(this.vw - w - 40, v.x));
    v.y = Math.min(this.vh * 0.4, Math.max(Math.min(8, this.vh - h - 96), v.y));
    this.applyDisplayTransform();
  }

  private resize() {
    if (this.destroyed) return;
    const r = this.root.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.rect = { left: r.left, top: r.top };
    const pageY = (this.vh ? (0 - this.view.y) / this.view.scale : 0);
    this.vw = r.width;
    this.vh = r.height;
    this.mx = this.options.embedded ? 0 : 48;
    this.my = this.options.embedded ? 0 : Math.round(Math.min(320, this.vh * 0.4));
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = this.vw + this.mx * 2;
    const ch = this.vh + this.my * 2;
    if (cw * ch * dpr * dpr > MAX_CANVAS_AREA) dpr = Math.sqrt(MAX_CANVAS_AREA / (cw * ch));
    this.dpr = dpr;
    for (const layer of [this.paper, this.hl, this.ink]) {
      layer.canvas.width = Math.round(cw * dpr);
      layer.canvas.height = Math.round(ch * dpr);
      layer.canvas.style.width = `${cw}px`;
      layer.canvas.style.height = `${ch}px`;
    }
    this.live.canvas.width = Math.round(this.vw * dpr);
    this.live.canvas.height = Math.round(this.vh * dpr);
    this.live.canvas.style.width = `${this.vw}px`;
    this.live.canvas.style.height = `${this.vh}px`;
    this.view.scale = this.fit * this.zoom;
    this.view.y = -pageY * this.view.scale;
    if (pageY === 0) this.view.y = this.options.embedded ? 0 : 8;
    this.clampView();
    this.renderCache();
    this.requestLive();
  }

  private applyDisplayTransform() {
    const v = this.view;
    const c = this.cacheView;
    const rel = v.scale / c.scale;
    const tx = v.x - rel * (c.x + this.mx);
    const ty = v.y - rel * (c.y + this.my);
    const t = `translate3d(${tx}px, ${ty}px, 0) scale(${rel})`;
    this.paper.canvas.style.transform = t;
    this.hl.canvas.style.transform = t;
    this.ink.canvas.style.transform = t;
    const world = `translate3d(${v.x}px, ${v.y}px, 0) scale(${v.scale})`;
    this.objectLayer.style.transform = world;
    this.topLayer.style.transform = world;
    this.options.onView?.(v);
  }

  /** Called while the view moves. Repaints only when the view has left the overscan area. */
  private viewChanged() {
    this.clampView();
    const c = this.cacheView;
    const v = this.view;
    const cx0 = (-this.mx - c.x) / c.scale, cy0 = (-this.my - c.y) / c.scale;
    const cx1 = (this.vw + this.mx - c.x) / c.scale, cy1 = (this.vh + this.my - c.y) / c.scale;
    const vx0 = -v.x / v.scale, vy0 = -v.y / v.scale;
    const vx1 = (this.vw - v.x) / v.scale, vy1 = (this.vh - v.y) / v.scale;
    if (vx0 < cx0 || vy0 < cy0 || vx1 > cx1 || vy1 > cy1) this.scheduleFull();
    if (this.selection.size) this.requestLive();
  }

  private zoomAt(sx: number, sy: number, scale: number) {
    const min = this.fit * 0.6;
    const max = this.fit * 6;
    const next = Math.max(min, Math.min(max, scale));
    const v = this.view;
    v.x = sx - ((sx - v.x) / v.scale) * next;
    v.y = sy - ((sy - v.y) / v.scale) * next;
    v.scale = next;
    this.zoom = next / this.fit;
  }

  // ---------------------------------------------------------------- rendering

  private get darkPaper() { return this.meta.paperColor === 'dark'; }

  private syncBlendMode() {
    this.root.dataset.paper = this.meta.paperColor;
  }

  private requestFrame() {
    if (this.rafId || this.destroyed) return;
    this.rafId = requestAnimationFrame(() => this.frame());
  }

  private requestLive() {
    this.liveDirty = true;
    this.requestFrame();
  }

  private scheduleFull() {
    this.cacheFullDirty = true;
    this.requestFrame();
  }

  private frame() {
    this.rafId = 0;
    if (this.destroyed) return;
    if (this.cacheFullDirty) {
      this.cacheFullDirty = false;
      this.cacheRects.length = 0;
      this.renderCache();
    } else if (this.cacheRects.length) {
      const rect = unionBbox(this.cacheRects)!;
      this.cacheRects.length = 0;
      this.renderCache(rect);
    }
    if (this.liveDirty) {
      this.liveDirty = false;
      const start = performance.now();
      this.renderLive();
      this.liveFrameMs = this.liveFrameMs * 0.9 + (performance.now() - start) * 0.1;
    }
    if (this.options.onStats && performance.now() - this.statsAt > 200) {
      this.statsAt = performance.now();
      this.options.onStats(this.stats());
    }
  }

  /** Repaints the cached layers: all of them, or just the page area `only`. */
  private renderCache(only?: Bbox) {
    if (!this.vw) return;
    const start = performance.now();
    if (!only) this.cacheView = { ...this.view };
    const c = this.cacheView;
    const { dpr, mx, my } = this;
    const a = dpr * c.scale;
    const e = dpr * (c.x + mx);
    const f = dpr * (c.y + my);
    const visible: Bbox = [(-mx - c.x) / c.scale, (-my - c.y) / c.scale, (this.vw + mx - c.x) / c.scale, (this.vh + my - c.y) / c.scale];

    const prepare = (l: Layer) => {
      const ctx = l.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (!only) {
        ctx.clearRect(0, 0, l.canvas.width, l.canvas.height);
        ctx.setTransform(a, 0, 0, a, e, f);
      } else {
        ctx.setTransform(a, 0, 0, a, e, f);
        ctx.save();
        ctx.beginPath();
        ctx.rect(only[0], only[1], only[2] - only[0], only[3] - only[1]);
        ctx.clip();
        ctx.clearRect(only[0], only[1], only[2] - only[0], only[3] - only[1]);
      }
    };

    prepare(this.hl);
    prepare(this.ink);
    const area = only ?? visible;
    const dark = this.darkPaper;
    for (const o of this.doc.objects) {
      if (isBox(o) || this.hidden.has(o.id)) continue;
      if (!bboxesIntersect(objectBbox(o), area)) continue;
      drawInk(isHighlighter(o) ? this.hl.ctx : this.ink.ctx, o as StrokeObject | ShapeObject, dark);
    }
    if (only) {
      this.hl.ctx.restore();
      this.ink.ctx.restore();
    } else {
      const p = this.paper.ctx;
      p.setTransform(1, 0, 0, 1, 0, 0);
      p.fillStyle = getComputedStyle(this.root).getPropertyValue('--desk') || '#E4E6EB';
      p.fillRect(0, 0, this.paper.canvas.width, this.paper.canvas.height);
      p.setTransform(a, 0, 0, a, e, f);
      drawPaper(p, this.meta, visible, c.scale);
    }
    this.cacheRenderMs = performance.now() - start;
    this.applyDisplayTransform();
  }

  private renderLive() {
    const { ctx, canvas } = this.live;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const v = this.view;
    const d = this.dpr;
    ctx.setTransform(d * v.scale, 0, 0, d * v.scale, d * v.x, d * v.y);
    const dark = this.darkPaper;
    const g = this.gesture;
    if (g?.k === 'stroke') {
      if (g.snapped) {
        drawShape(ctx, { ...g.snapped, color: this.tool.color, width: this.tool.width, highlighter: this.tool.kind === 'highlighter' }, dark);
      } else {
        const brush = this.tool.kind === 'highlighter' ? 'highlighter' : this.tool.brush;
        const pts = this.predicted.length ? g.pts.concat(this.predicted) : g.pts;
        fillStroke(ctx, strokePath(pts, brush, this.tool.width, g.sim, false), brush, this.tool.color, dark);
      }
    } else if (g?.k === 'shape') {
      drawShape(ctx, { shape: this.tool.shape, x1: g.x1, y1: g.y1, x2: g.x2, y2: g.y2, color: this.tool.color, width: this.tool.width, highlighter: false }, dark);
    } else if (g?.k === 'erase') {
      ctx.strokeStyle = dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1 / v.scale;
      ctx.beginPath();
      ctx.arc(g.x, g.y, this.eraserRadius(), 0, Math.PI * 2);
      ctx.stroke();
    } else if (g?.k === 'lasso') {
      ctx.strokeStyle = resolveInk('#274A9F', dark);
      ctx.fillStyle = 'rgba(39, 74, 159, 0.08)';
      ctx.lineWidth = 1.5 / v.scale;
      ctx.setLineDash([6 / v.scale, 5 / v.scale]);
      ctx.beginPath();
      ctx.moveTo(g.poly[0], g.poly[1]);
      for (let i = 2; i < g.poly.length; i += 2) ctx.lineTo(g.poly[i], g.poly[i + 1]);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (g?.k === 'move' || g?.k === 'resize') {
      ctx.save();
      ctx.transform(g.m.sx, 0, 0, g.m.sy, g.m.tx, g.m.ty);
      for (const o of g.originals) if (!isBox(o)) drawInk(ctx, o as StrokeObject | ShapeObject, dark);
      ctx.restore();
    }
    this.drawSelectionChrome(ctx);
  }

  private currentSelectionBox(): Bbox | null {
    const box = this.selectionBox;
    if (!box) return null;
    const g = this.gesture;
    if (g?.k === 'move' || g?.k === 'resize') {
      const m = g.m;
      return [box[0] * m.sx + m.tx, box[1] * m.sy + m.ty, box[2] * m.sx + m.tx, box[3] * m.sy + m.ty];
    }
    return box;
  }

  private drawSelectionChrome(ctx: CanvasRenderingContext2D) {
    const b = this.currentSelectionBox();
    if (!b) return;
    const s = this.view.scale;
    ctx.save();
    ctx.strokeStyle = '#3E66C9';
    ctx.lineWidth = 1.5 / s;
    ctx.setLineDash([7 / s, 5 / s]);
    ctx.strokeRect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
    ctx.setLineDash([]);
    ctx.fillStyle = '#FFFFFF';
    const r = 7 / s;
    for (const [hx, hy] of [[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]]) {
      ctx.beginPath();
      ctx.arc(hx, hy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  private onDocChange(e: { removed: PageObject[]; added: PageObject[]; rect: Bbox | null }) {
    if (!e.rect) return;
    const onlyAdds = e.removed.length === 0 && e.added.every((o) => !isBox(o));
    const objects = this.doc.objects;
    const newest = objects[objects.length - 1];
    if (onlyAdds && e.added.length === 1 && newest === e.added[0]) {
      // The common case, a new stroke on top. Paint it straight in, in the same task that clears
      // the live canvas, so the ink can't flicker between the two.
      const o = e.added[0] as StrokeObject | ShapeObject;
      const c = this.cacheView;
      for (const l of [this.hl, this.ink]) {
        l.ctx.setTransform(this.dpr * c.scale, 0, 0, this.dpr * c.scale, this.dpr * (c.x + this.mx), this.dpr * (c.y + this.my));
      }
      drawInk(isHighlighter(o) ? this.hl.ctx : this.ink.ctx, o, this.darkPaper);
    } else if (e.added.some((o) => !isBox(o)) || e.removed.some((o) => !isBox(o))) {
      this.cacheRects.push(e.rect);
      this.requestFrame();
    }
    this.pruneSelection();
  }

  private pruneSelection() {
    let changed = false;
    for (const id of this.selection) {
      if (!this.doc.get(id)) {
        this.selection.delete(id);
        changed = true;
      }
    }
    if (changed) {
      this.refreshSelectionBox();
      this.emitSelection();
    }
  }

  private selectedObjects(): PageObject[] {
    return [...this.selection].map((id) => this.doc.get(id)).filter(Boolean) as PageObject[];
  }

  private refreshSelectionBox() {
    this.selectionBox = unionBbox(this.selectedObjects().map(objectBbox));
  }

  private emitSelection() {
    this.options.onSelection?.([...this.selection], this.selectionBox);
  }

  // ---------------------------------------------------------------- input

  private bindInput() {
    const r = this.root;
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      r.addEventListener(type, fn as EventListener, opts);
      this.cleanups.push(() => r.removeEventListener(type, fn as EventListener, opts));
    };
    on('pointerdown', (e) => this.onPointerDown(e));
    on('pointermove', (e) => this.onPointerMove(e));
    on('pointerup', (e) => this.onPointerUp(e, false));
    on('pointercancel', (e) => this.onPointerUp(e, true));
    on('lostpointercapture', (e) => { if (this.gestureId() === e.pointerId) this.onPointerUp(e, false); });

    // These stop iOS text selection, the magnifier, callouts, double-tap zoom and Scribble.
    const blockTouch = (e: TouchEvent) => {
      if (this.isIgnored(e.target)) return;
      if (this.options.embedded) {
        const stylus = [...e.touches].some((t) => (t as Touch & { touchType?: string }).touchType === 'stylus');
        if (stylus && e.cancelable) e.preventDefault();
        return;
      }
      if (e.cancelable) e.preventDefault();
    };
    on('touchstart', blockTouch, { passive: false });
    on('touchmove', blockTouch, { passive: false });
    on('contextmenu', (e) => { if (!this.isIgnored(e.target)) e.preventDefault(); });
    on('selectstart' as keyof HTMLElementEventMap, (e) => { if (!this.isIgnored(e.target)) e.preventDefault(); });
    on('gesturestart' as keyof HTMLElementEventMap, (e) => e.preventDefault());
    on('dragstart', (e) => e.preventDefault());
    on('wheel', (e) => this.onWheel(e), { passive: false });
  }

  private isIgnored(target: EventTarget | null) {
    return !!(target as HTMLElement | null)?.closest?.('[data-engine-ignore]');
  }

  private gestureId() {
    return this.gesture ? this.gesture.id : -1;
  }

  private onWheel(e: WheelEvent) {
    if (this.options.embedded || this.isIgnored(e.target)) return;
    e.preventDefault();
    const r = this.root.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) {
      this.zoomAt(e.clientX - r.left, e.clientY - r.top, this.view.scale * Math.exp(-e.deltaY * 0.01));
    } else {
      this.view.x -= e.deltaX;
      this.view.y -= e.deltaY;
    }
    this.viewChanged();
    clearTimeout(this.wheelTimer);
    this.wheelTimer = window.setTimeout(() => this.scheduleFull(), 120);
  }

  private wheelTimer = 0;

  private onPointerDown(e: PointerEvent) {
    if (this.isIgnored(e.target)) return;
    const r = this.root.getBoundingClientRect();
    this.rect = { left: r.left, top: r.top };

    if (e.pointerType === 'pen') {
      this.lastPenTime = performance.now();
      this.options.onPenSeen?.();
      this.cancelTouchGesture(true);
    }
    if (e.pointerType === 'touch') {
      if (this.options.embedded) return; // The finger scrolls the reader.
      if (this.isPalm(e)) {
        this.rejected.add(e.pointerId);
        return;
      }
      const fingerStrokeAbort = this.gesture?.k === 'stroke' && this.gesture.touch && performance.now() - this.gesture.downTime < 180 && this.touches.size === 0;
      const fingerCanDraw = this.options.fingerDraws && !this.touches.size && !this.gesture;
      if (fingerStrokeAbort) {
        // A second finger soon after the first: it was a pinch all along, so drop the stroke.
        const g = this.gesture as Extract<Gesture, { k: 'stroke' }>;
        this.touches.set(g.id, { x: g.pts[0] * this.view.scale + this.view.x, y: g.pts[1] * this.view.scale + this.view.y });
        this.abortGesture();
      } else if (fingerCanDraw) {
        this.startToolGesture(e);
        return;
      }
      if (this.gesture) {
        this.rejected.add(e.pointerId);
        return;
      }
      // A finger can drag a selection and its handles, as long as it's the only one down.
      if (!this.touches.size && this.selectionBox) {
        const p = this.toPage(e);
        const b = this.selectionBox;
        if (this.hitHandle(p.x, p.y, b) || (p.x >= b[0] && p.x <= b[2] && p.y >= b[1] && p.y <= b[3])) {
          this.startToolGesture(e);
          return;
        }
      }
      this.onTouchDown(e);
      return;
    }
    if (e.pointerType === 'mouse') {
      if (e.button === 1) {
        this.onTouchDown(e);
        return;
      }
      if (e.button !== 0) return;
    }
    if (this.gesture) return;
    this.startToolGesture(e);
  }

  private isPalm(e: PointerEvent) {
    if (performance.now() - this.lastPenTime < PALM_WINDOW_MS) return true;
    if (this.gesture && !(this.gesture.k === 'stroke' && this.gesture.touch)) return true;
    return Math.max(e.width, e.height) > PALM_RADIUS * 2;
  }

  private onPointerMove(e: PointerEvent) {
    if (e.pointerType === 'pen') this.lastPenTime = performance.now();
    if (this.rejected.has(e.pointerId)) return;
    if (this.touches.has(e.pointerId)) {
      this.onTouchMove(e);
      return;
    }
    const g = this.gesture;
    if (!g || g.id !== e.pointerId) return;
    this.recordStats(e);
    const events = this.coalesced(e);
    switch (g.k) {
      case 'stroke':
        for (const ev of events) this.addStrokePoint(g, ev);
        this.updatePrediction(g, e);
        this.watchHold(g, e);
        this.requestLive();
        break;
      case 'erase': {
        for (const ev of events) {
          const p = this.toPage(ev);
          this.eraseSegment(g, p.x, p.y);
        }
        this.requestLive();
        break;
      }
      case 'lasso': {
        const p = this.toPage(e);
        g.poly.push(p.x, p.y);
        this.requestLive();
        break;
      }
      case 'shape': {
        const p = this.toPage(e);
        g.x2 = p.x;
        g.y2 = p.y;
        this.requestLive();
        break;
      }
      case 'move': {
        const p = this.toPage(e);
        g.m = { sx: 1, sy: 1, tx: p.x - g.startX, ty: p.y - g.startY };
        this.previewBoxes(g.originals, g.m);
        this.requestLive();
        break;
      }
      case 'resize': {
        const p = this.toPage(e);
        const w = g.box[2] - g.box[0] || 1;
        const h = g.box[3] - g.box[1] || 1;
        const s = Math.max(0.1, Math.max(Math.abs(p.x - g.ax) / w, Math.abs(p.y - g.ay) / h));
        g.m = { sx: s, sy: s, tx: g.ax - g.ax * s, ty: g.ay - g.ay * s };
        this.previewBoxes(g.originals, g.m);
        this.requestLive();
        break;
      }
      case 'tap':
        break;
    }
  }

  private onPointerUp(e: PointerEvent, cancelled: boolean) {
    if (e.pointerType === 'pen') this.lastPenTime = performance.now();
    this.rejected.delete(e.pointerId);
    if (this.touches.has(e.pointerId)) {
      this.onTouchUp(e);
      return;
    }
    const g = this.gesture;
    if (!g || g.id !== e.pointerId) return;
    if (cancelled) {
      this.abortGesture();
      return;
    }
    this.gesture = null;
    this.root.classList.remove('is-live-hl');
    switch (g.k) {
      case 'stroke':
        clearTimeout(g.holdTimer);
        this.commitStroke(g);
        break;
      case 'erase':
        this.doc.pushHistory({ removed: [...g.removed.values()], added: [...g.added.values()] });
        this.options.onHistory?.();
        break;
      case 'lasso':
        this.finishLasso(g.poly);
        break;
      case 'shape':
        this.commitShape(g);
        break;
      case 'tap':
        this.finishTap(g, e);
        break;
      case 'move':
      case 'resize':
        this.finishTransform(g.originals, g.m);
        break;
    }
    this.predicted = [];
    this.requestLive();
  }

  private coalesced(e: PointerEvent): PointerEvent[] {
    const list = e.getCoalescedEvents?.();
    this.lastEvents.coalesced = list?.length ?? 0;
    // Synthetic events and some browsers return an empty list.
    return list && list.length ? list : [e];
  }

  private recordStats(e: PointerEvent) {
    this.lastEvents.type = e.pointerType;
    this.lastEvents.pressure = e.pressure;
    this.lastEvents.tiltX = e.tiltX;
    this.lastEvents.tiltY = e.tiltY;
  }

  private toPage(e: PointerEvent) {
    return { x: (e.clientX - this.rect.left - this.view.x) / this.view.scale, y: (e.clientY - this.rect.top - this.view.y) / this.view.scale };
  }

  private startToolGesture(e: PointerEvent) {
    try { this.root.setPointerCapture(e.pointerId); } catch { /* Synthetic pointers can't be captured. */ }
    this.recordStats(e);
    const p = this.toPage(e);
    const id = e.pointerId;

    const box = this.selectionBox;
    if (box) {
      // Handles and the box itself take priority for any tool. Any other press clears the selection.
      const handle = this.hitHandle(p.x, p.y, box);
      const originals = this.selectedObjects();
      if (handle) {
        this.beginBoxPreview(originals);
        this.gesture = { k: 'resize', id, ax: handle.ax, ay: handle.ay, box, originals, m: { sx: 1, sy: 1, tx: 0, ty: 0 } };
        return;
      }
      if (p.x >= box[0] && p.x <= box[2] && p.y >= box[1] && p.y <= box[3]) {
        this.beginBoxPreview(originals);
        this.gesture = { k: 'move', id, startX: p.x, startY: p.y, originals, m: { sx: 1, sy: 1, tx: 0, ty: 0 } };
        return;
      }
      this.clearSelection();
    }

    const t = this.tool;
    switch (t.kind) {
      case 'pen':
      case 'highlighter': {
        const g: Extract<Gesture, { k: 'stroke' }> = {
          k: 'stroke', id, pts: [], sim: e.pointerType !== 'pen', t0: e.timeStamp,
          holdX: e.clientX, holdY: e.clientY, holdTimer: 0, snapped: null, downTime: performance.now(), touch: e.pointerType === 'touch',
        };
        this.gesture = g;
        if (t.kind === 'highlighter') this.root.classList.add('is-live-hl');
        this.addStrokePoint(g, e);
        this.watchHold(g, e, true);
        this.requestLive();
        break;
      }
      case 'eraser':
      case 'pixel-eraser': {
        const g: Extract<Gesture, { k: 'erase' }> = { k: 'erase', id, pixel: t.kind === 'pixel-eraser', lastX: p.x, lastY: p.y, x: p.x, y: p.y, removed: new Map(), added: new Map() };
        this.gesture = g;
        this.eraseSegment(g, p.x, p.y);
        this.requestLive();
        break;
      }
      case 'lasso':
        this.gesture = { k: 'lasso', id, poly: [p.x, p.y] };
        break;
      case 'shape':
        this.gesture = { k: 'shape', id, x1: p.x, y1: p.y, x2: p.x, y2: p.y };
        break;
      case 'text':
        this.gesture = { k: 'tap', id, x: p.x, y: p.y, cx: e.clientX, cy: e.clientY };
        break;
    }
  }

  private abortGesture() {
    const g = this.gesture;
    if (!g) return;
    this.gesture = null;
    this.root.classList.remove('is-live-hl');
    if (g.k === 'stroke') clearTimeout(g.holdTimer);
    if (g.k === 'erase') {
      this.doc.pushHistory({ removed: [...g.removed.values()], added: [...g.added.values()] });
      this.options.onHistory?.();
    }
    if (g.k === 'move' || g.k === 'resize') this.endBoxPreview(g.originals);
    this.predicted = [];
    this.requestLive();
  }

  // ---------------------------------------------------------------- strokes

  private addStrokePoint(g: Extract<Gesture, { k: 'stroke' }>, ev: PointerEvent) {
    const x = (ev.clientX - this.rect.left - this.view.x) / this.view.scale;
    const y = (ev.clientY - this.rect.top - this.view.y) / this.view.scale;
    const n = g.pts.length;
    let pressure = ev.pointerType === 'pen' ? pressureCurve(ev.pressure) : 0.5;
    // Tilting a pencil over shades with the side of the lead, which reads as a wider line.
    if (this.tool.brush === 'pencil' && ev.pointerType === 'pen') {
      const tilt = Math.min(1, Math.hypot(ev.tiltX || 0, ev.tiltY || 0) / 70);
      pressure = Math.min(1, pressure * (1 + tilt * 0.8));
    }
    if (n && Math.hypot(x - g.pts[n - 4], y - g.pts[n - 3]) < 0.2 / this.view.scale) {
      g.pts[n - 2] = Math.max(g.pts[n - 2], pressure);
      return;
    }
    g.pts.push(x, y, pressure, Math.max(0, ev.timeStamp - g.t0));
  }

  private updatePrediction(g: Extract<Gesture, { k: 'stroke' }>, e: PointerEvent) {
    const list = e.getPredictedEvents?.() ?? [];
    this.lastEvents.predicted = list.length;
    this.predicted = [];
    if (g.snapped) return;
    const last = g.pts[g.pts.length - 2];
    for (const ev of list) {
      const p = this.toPage(ev);
      this.predicted.push(p.x, p.y, ev.pointerType === 'pen' ? pressureCurve(ev.pressure) : 0.5, last);
    }
  }

  /** Hold still at the end of a stroke to snap it into a shape. */
  private watchHold(g: Extract<Gesture, { k: 'stroke' }>, e: PointerEvent, first = false) {
    if (g.snapped) return;
    if (first || Math.hypot(e.clientX - g.holdX, e.clientY - g.holdY) > HOLD_TOLERANCE) {
      g.holdX = e.clientX;
      g.holdY = e.clientY;
      clearTimeout(g.holdTimer);
      g.holdTimer = window.setTimeout(() => {
        if (this.gesture !== g || this.options.embedded) return;
        const shape = recognizeShape(Float32Array.from(g.pts));
        if (shape) {
          g.snapped = shape;
          this.predicted = [];
          this.requestLive();
        }
      }, HOLD_SNAP_MS);
    }
  }

  private commitStroke(g: Extract<Gesture, { k: 'stroke' }>) {
    const t = this.tool;
    const highlighter = t.kind === 'highlighter';
    let obj: PageObject;
    if (g.snapped) {
      obj = { type: 'shape', id: newId(), z: this.doc.allocZ(), ...g.snapped, color: t.color, width: t.width, highlighter };
    } else {
      const pts = Float32Array.from(g.pts);
      obj = {
        type: 'stroke', id: newId(), z: this.doc.allocZ(), brush: highlighter ? 'highlighter' : t.brush, color: t.color,
        width: t.width, sim: g.sim, pts, bbox: pointsBbox(pts, strokePad(t.width)),
      };
    }
    this.doc.commit({ removed: [], added: [obj] });
    // Clearing the live canvas now, not next frame, means the stroke is never drawn twice or not at all.
    this.liveDirty = false;
    this.predicted = [];
    this.renderLive();
    this.growFor([obj]);
    this.options.onHistory?.();
  }

  private commitShape(g: Extract<Gesture, { k: 'shape' }>) {
    if (Math.hypot(g.x2 - g.x1, g.y2 - g.y1) < 3) return;
    const t = this.tool;
    const obj: ShapeObject = {
      type: 'shape', id: newId(), z: this.doc.allocZ(), shape: t.shape as ShapeKind, x1: g.x1, y1: g.y1, x2: g.x2, y2: g.y2,
      color: t.color, width: t.width, highlighter: false,
    };
    this.doc.commit({ removed: [], added: [obj] });
    this.growFor([obj]);
    this.options.onHistory?.();
  }

  /** Grows the page once anything lands near the bottom of the last sheet. */
  private growFor(objs: PageObject[]) {
    if (this.options.embedded) return;
    const bottom = Math.max(...objs.map((o) => objectBbox(o)[3]));
    let sheets = this.meta.sheets;
    while (bottom > sheets * SHEET_HEIGHT - 60) sheets++;
    if (sheets !== this.meta.sheets) {
      this.meta = { ...this.meta, sheets };
      this.options.onMeta?.(this.meta);
      this.clampView();
      this.scheduleFull();
    }
  }

  // ---------------------------------------------------------------- erasing

  private eraserRadius() {
    return Math.max(2, this.tool.width);
  }

  private eraseSegment(g: Extract<Gesture, { k: 'erase' }>, x: number, y: number) {
    const r = this.eraserRadius();
    const dist = Math.hypot(x - g.lastX, y - g.lastY);
    const steps = Math.max(1, Math.ceil(dist / (r * 0.6)));
    for (let i = 1; i <= steps; i++) {
      const px = g.lastX + ((x - g.lastX) * i) / steps;
      const py = g.lastY + ((y - g.lastY) * i) / steps;
      this.eraseAt(g, px, py, r);
    }
    g.lastX = g.x = x;
    g.lastY = g.y = y;
  }

  private eraseAt(g: Extract<Gesture, { k: 'erase' }>, x: number, y: number, r: number) {
    const removed: PageObject[] = [];
    const added: PageObject[] = [];
    const probe: Bbox = [x - r - 60, y - r - 60, x + r + 60, y + r + 60];
    for (const o of this.doc.objects) {
      if (isBox(o) || !bboxesIntersect(objectBbox(o), probe)) continue;
      const ink = o as StrokeObject | ShapeObject;
      if (!inkHitsCircle(ink, x, y, r)) continue;
      if (g.pixel) {
        const source = ink.type === 'shape' ? shapeToStroke(ink) : ink;
        const parts = cutStroke(source, x, y, r);
        if (parts === null) continue;
        removed.push(ink);
        added.push(...parts);
      } else {
        removed.push(ink);
      }
    }
    if (!removed.length) return;
    this.doc.applySilently(removed, added);
    // Net effect for undo: fragments made and erased within this gesture cancel out.
    for (const o of removed) {
      if (g.added.has(o.id)) g.added.delete(o.id);
      else g.removed.set(o.id, o);
    }
    for (const o of added) g.added.set(o.id, o);
  }

  // ---------------------------------------------------------------- lasso and selection

  private hitHandle(x: number, y: number, b: Bbox) {
    const r = (SELECT_HANDLE + 10) / this.view.scale;
    const corners: [number, number, number, number][] = [
      [b[0], b[1], b[2], b[3]], [b[2], b[1], b[0], b[3]], [b[0], b[3], b[2], b[1]], [b[2], b[3], b[0], b[1]],
    ];
    for (const [cx, cy, ax, ay] of corners) {
      if (Math.hypot(x - cx, y - cy) <= r) return { ax, ay };
    }
    return null;
  }

  private finishLasso(poly: number[]) {
    if (poly.length < 6) {
      // A tap with the lasso picks the box under it.
      const box = this.boxAt(poly[0], poly[1]);
      if (box) this.setSelection([box.id]);
      return;
    }
    const ids = this.doc.objects.filter((o) => objectInLasso(o, poly)).map((o) => o.id);
    this.setSelection(ids);
  }

  private boxAt(x: number, y: number): PageObject | null {
    const objects = this.doc.objects;
    for (let i = objects.length - 1; i >= 0; i--) {
      const o = objects[i];
      if (!isBox(o)) continue;
      if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) return o;
    }
    return null;
  }

  private finishTap(g: Extract<Gesture, { k: 'tap' }>, e: PointerEvent) {
    if (Math.hypot(e.clientX - g.cx, e.clientY - g.cy) > TAP_DISTANCE) return;
    const box = this.boxAt(g.x, g.y);
    if (box?.type === 'text') this.options.onEditObject?.(box.id);
    else if (box) this.setSelection([box.id]);
    else this.options.onRequestText?.(g.x, g.y);
  }

  private beginBoxPreview(originals: PageObject[]) {
    for (const o of originals) this.hidden.add(o.id);
    this.renderCache();
    this.options.onSelection?.([...this.selection], null);
  }

  private endBoxPreview(originals: PageObject[]) {
    for (const o of originals) {
      this.hidden.delete(o.id);
      const el = this.boxElement(o.id);
      if (el) el.style.transform = '';
    }
    this.renderCache();
    this.emitSelection();
  }

  private boxElement(id: string) {
    return this.objectLayer.querySelector<HTMLElement>(`[data-obj-id="${id}"]`);
  }

  private previewBoxes(originals: PageObject[], m: Transform) {
    for (const o of originals) {
      if (!isBox(o)) continue;
      const el = this.boxElement(o.id);
      if (el) el.style.transform = `translate(${o.x * m.sx + m.tx - o.x}px, ${o.y * m.sy + m.ty - o.y}px) scale(${m.sx}, ${m.sy})`;
    }
  }

  private finishTransform(originals: PageObject[], m: Transform) {
    const unchanged = m.sx === 1 && m.sy === 1 && Math.abs(m.tx) < 0.5 && Math.abs(m.ty) < 0.5;
    if (unchanged) {
      this.endBoxPreview(originals);
      return;
    }
    const updated = originals.map((o) => transformObject(o, m));
    for (const o of originals) {
      this.hidden.delete(o.id);
      const el = this.boxElement(o.id);
      if (el) el.style.transform = '';
    }
    this.doc.commit({ removed: originals, added: updated } as Op);
    this.refreshSelectionBox();
    this.growFor(updated);
    this.renderCache();
    this.emitSelection();
    this.options.onHistory?.();
  }

  // ---------------------------------------------------------------- touch gestures

  private onTouchDown(e: PointerEvent) {
    try { this.root.setPointerCapture(e.pointerId); } catch { /* Synthetic pointers can't be captured. */ }
    cancelAnimationFrame(this.momentumRaf);
    this.touches.set(e.pointerId, { x: e.clientX - this.rect.left, y: e.clientY - this.rect.top });
    if (this.touches.size === 1) {
      this.touchMode = 'pending';
      this.touchStartView = { ...this.view };
      this.touchStartTime = performance.now();
      this.panLast = { x: e.clientX, y: e.clientY, t: performance.now() };
      this.velocity = { x: 0, y: 0 };
    } else if (this.touches.size === 2) {
      this.beginPinch();
    }
  }

  private beginPinch() {
    const [a, b] = [...this.touches.values()];
    const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    this.touchMode = 'pinch';
    this.pinchStart = { dist, scale: this.view.scale, ax: (cx - this.view.x) / this.view.scale, ay: (cy - this.view.y) / this.view.scale };
  }

  private onTouchMove(e: PointerEvent) {
    const t = this.touches.get(e.pointerId)!;
    t.x = e.clientX - this.rect.left;
    t.y = e.clientY - this.rect.top;
    if (this.touchMode === 'pending') {
      if (Math.hypot(e.clientX - this.panLast.x, e.clientY - this.panLast.y) < PAN_THRESHOLD) return;
      this.touchMode = 'pan';
      this.panLast = { x: e.clientX, y: e.clientY, t: performance.now() };
      return;
    }
    if (this.touchMode === 'pan') {
      const now = performance.now();
      const dx = e.clientX - this.panLast.x, dy = e.clientY - this.panLast.y;
      this.view.x += dx;
      this.view.y += dy;
      const dt = Math.max(1, now - this.panLast.t);
      this.velocity = { x: 0.7 * (dx / dt) + 0.3 * this.velocity.x, y: 0.7 * (dy / dt) + 0.3 * this.velocity.y };
      this.panLast = { x: e.clientX, y: e.clientY, t: now };
      this.viewChanged();
    } else if (this.touchMode === 'pinch' && this.touches.size >= 2) {
      const [a, b] = [...this.touches.values()];
      const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const min = this.fit * 0.6, max = this.fit * 6;
      const next = Math.max(min, Math.min(max, this.pinchStart.scale * (dist / this.pinchStart.dist)));
      this.view.scale = next;
      this.zoom = next / this.fit;
      this.view.x = cx - this.pinchStart.ax * next;
      this.view.y = cy - this.pinchStart.ay * next;
      this.viewChanged();
    }
  }

  private onTouchUp(e: PointerEvent) {
    this.touches.delete(e.pointerId);
    if (this.touches.size === 1 && this.touchMode === 'pinch') {
      // One finger stays down: carry on panning from where it is.
      const [rest] = [...this.touches.values()];
      this.touchMode = 'pan';
      this.panLast = { x: rest.x + this.rect.left, y: rest.y + this.rect.top, t: performance.now() };
      this.velocity = { x: 0, y: 0 };
      this.scheduleFull();
      return;
    }
    if (this.touches.size === 0) {
      const mode = this.touchMode;
      this.touchMode = null;
      if (mode === 'pan' && Math.hypot(this.velocity.x, this.velocity.y) > 0.15) this.startMomentum();
      else if (mode === 'pan' || mode === 'pinch') this.scheduleFull();
      else if (mode === 'pending') this.onFingerTap(e);
    }
  }

  /** A finger tap can't draw, but it can place text and pick boxes. */
  private onFingerTap(e: PointerEvent) {
    if (this.selection.size) {
      this.clearSelection();
      return;
    }
    const p = this.toPage(e);
    if (this.tool.kind === 'text') {
      this.finishTap({ k: 'tap', id: e.pointerId, x: p.x, y: p.y, cx: e.clientX, cy: e.clientY }, e);
    } else if (this.tool.kind === 'lasso') {
      this.finishLasso([p.x, p.y]);
    }
  }

  /**
   * A pen landing means any touch in progress was a palm. If the touch only just started, its small
   * pan is undone too. A deliberate pan that has run a while stays where it is.
   */
  private cancelTouchGesture(fromPen: boolean) {
    cancelAnimationFrame(this.momentumRaf);
    if (!this.touches.size) return;
    for (const id of this.touches.keys()) this.rejected.add(id);
    this.touches.clear();
    if (fromPen && this.touchStartView && performance.now() - this.touchStartTime < 800) {
      this.view = { ...this.touchStartView };
      this.clampView();
    }
    this.touchMode = null;
    this.scheduleFull();
  }

  private startMomentum() {
    let last = performance.now();
    const step = () => {
      const now = performance.now();
      const dt = Math.min(32, now - last);
      last = now;
      this.view.x += this.velocity.x * dt;
      this.view.y += this.velocity.y * dt;
      const decay = Math.pow(0.995, dt);
      this.velocity.x *= decay;
      this.velocity.y *= decay;
      this.viewChanged();
      if (Math.hypot(this.velocity.x, this.velocity.y) > 0.02 && !this.destroyed) {
        this.momentumRaf = requestAnimationFrame(step);
      } else {
        this.scheduleFull();
      }
    };
    this.momentumRaf = requestAnimationFrame(step);
  }
}

