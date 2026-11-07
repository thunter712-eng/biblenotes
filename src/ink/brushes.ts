import { getStroke } from 'perfect-freehand';
import { POINT_STRIDE, type Brush, type Points, type ShapeObject, type StrokeObject } from './types.ts';

interface BrushOptions {
  size: number;
  thinning: number;
  smoothing: number;
  streamline: number;
  simulatePressure: boolean;
  last: boolean;
  start?: { cap: boolean };
  end?: { cap: boolean };
}

function optionsFor(brush: Brush, width: number, sim: boolean, last: boolean): BrushOptions {
  switch (brush) {
    case 'fountain':
      return { size: width * 2.2, thinning: 0.72, smoothing: 0.55, streamline: 0.42, simulatePressure: sim, last };
    case 'pencil':
      return { size: width * 1.5, thinning: 0.35, smoothing: 0.45, streamline: 0.35, simulatePressure: sim, last };
    case 'highlighter':
      return { size: width, thinning: 0, smoothing: 0.6, streamline: 0.6, simulatePressure: false, last, start: { cap: false }, end: { cap: false } };
    default:
      return { size: width * 1.35, thinning: 0.22, smoothing: 0.5, streamline: 0.38, simulatePressure: sim, last };
  }
}

/** Turns a perfect-freehand outline into a closed, smooth path. */
function outlineToPath(outline: number[][]): Path2D {
  const path = new Path2D();
  const n = outline.length;
  if (n < 2) return path;
  path.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < n - 1; i++) {
    const a = outline[i], b = outline[i + 1];
    path.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  }
  path.lineTo(outline[n - 1][0], outline[n - 1][1]);
  path.closePath();
  return path;
}

export function strokePath(pts: Points | number[], brush: Brush, width: number, sim: boolean, last: boolean): Path2D {
  const input: number[][] = new Array(pts.length / POINT_STRIDE);
  for (let i = 0; i < input.length; i++) {
    const o = i * POINT_STRIDE;
    input[i] = [pts[o], pts[o + 1], pts[o + 2]];
  }
  return outlineToPath(getStroke(input, optionsFor(brush, width, sim, last)));
}

/** Paths are expensive to build and cheap to fill, so each committed stroke keeps one. */
const pathCache = new WeakMap<StrokeObject, Path2D>();

function cachedPath(s: StrokeObject): Path2D {
  let p = pathCache.get(s);
  if (!p) {
    p = strokePath(s.pts, s.brush, s.width, s.sim, true);
    pathCache.set(s, p);
  }
  return p;
}

const AUTO_LIGHT = '#1B1F2B';
const AUTO_DARK = '#ECEEF4';

/** "auto" is the default ink: near-black on light paper, near-white on dark. */
export const resolveInk = (color: string, darkPaper: boolean) => (color === 'auto' ? (darkPaper ? AUTO_DARK : AUTO_LIGHT) : color);

const grainCache = new Map<string, CanvasPattern | null>();

/** A speckled fill that gives the pencil brush its tooth. Deterministic, so a redraw never shimmers. */
function pencilPattern(ctx: CanvasRenderingContext2D, color: string): CanvasPattern | string {
  const cached = grainCache.get(color);
  if (cached) return cached;
  const size = 48;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  g.fillRect(0, 0, size, size);
  g.globalCompositeOperation = 'destination-out';
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 620; i++) {
    g.globalAlpha = 0.25 + rand() * 0.6;
    g.fillRect(rand() * size, rand() * size, 0.5 + rand() * 0.8, 0.5 + rand() * 0.8);
  }
  const pattern = ctx.createPattern(c, 'repeat');
  grainCache.set(color, pattern);
  return pattern ?? color;
}

export const HIGHLIGHTER_ALPHA = 0.55;

export function fillStroke(ctx: CanvasRenderingContext2D, path: Path2D, brush: Brush, color: string, darkPaper: boolean) {
  const ink = resolveInk(color, darkPaper);
  if (brush === 'pencil') {
    ctx.fillStyle = pencilPattern(ctx, ink);
    ctx.fill(path);
  } else if (brush === 'highlighter') {
    ctx.globalAlpha = HIGHLIGHTER_ALPHA;
    ctx.fillStyle = ink;
    ctx.fill(path);
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = ink;
    ctx.fill(path);
  }
}

export function drawShape(ctx: CanvasRenderingContext2D, s: Omit<ShapeObject, 'type' | 'id' | 'z'>, darkPaper: boolean) {
  const ink = resolveInk(s.color, darkPaper);
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.lineWidth = s.highlighter ? s.width : s.width * 1.2;
  ctx.lineCap = s.highlighter ? 'butt' : 'round';
  ctx.lineJoin = 'round';
  if (s.highlighter) ctx.globalAlpha = HIGHLIGHTER_ALPHA;
  ctx.beginPath();
  const { x1, y1, x2, y2 } = s;
  if (s.shape === 'rect') {
    ctx.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
  } else if (s.shape === 'ellipse') {
    ctx.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2, 0, 0, Math.PI * 2);
  } else {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    if (s.shape === 'arrow') {
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const head = Math.max(12, s.width * 5);
      ctx.moveTo(x2 - Math.cos(angle - 0.45) * head, y2 - Math.sin(angle - 0.45) * head);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x2 - Math.cos(angle + 0.45) * head, y2 - Math.sin(angle + 0.45) * head);
    }
  }
  ctx.stroke();
  ctx.restore();
}

export function drawInk(ctx: CanvasRenderingContext2D, o: StrokeObject | ShapeObject, darkPaper: boolean) {
  if (o.type === 'stroke') fillStroke(ctx, cachedPath(o), o.brush, o.color, darkPaper);
  else drawShape(ctx, o, darkPaper);
}

