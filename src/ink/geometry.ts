import { POINT_STRIDE, type Bbox, type PageObject, type Points, type ShapeObject, type StrokeObject } from './types.ts';

/** Room around a stroke's points for its drawn width. The fountain brush is the widest, at about 1.1 times the width either side. */
export const strokePad = (width: number) => width * 1.5 + 1;

export function pointsBbox(pts: Points | number[], pad = 0): Bbox {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < pts.length; i += POINT_STRIDE) {
    const x = pts[i], y = pts[i + 1];
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
}

export const shapeBbox = (s: ShapeObject): Bbox => {
  const pad = s.width + (s.shape === 'arrow' ? s.width * 4 + 8 : 0);
  return [Math.min(s.x1, s.x2) - pad, Math.min(s.y1, s.y2) - pad, Math.max(s.x1, s.x2) + pad, Math.max(s.y1, s.y2) + pad];
};

export function objectBbox(o: PageObject): Bbox {
  if (o.type === 'stroke') return o.bbox;
  if (o.type === 'shape') return shapeBbox(o);
  return [o.x, o.y, o.x + o.w, o.y + o.h];
}

export const bboxesIntersect = (a: Bbox, b: Bbox) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

export function unionBbox(boxes: Bbox[]): Bbox | null {
  if (!boxes.length) return null;
  const u: Bbox = [...boxes[0]];
  for (const b of boxes) {
    u[0] = Math.min(u[0], b[0]);
    u[1] = Math.min(u[1], b[1]);
    u[2] = Math.max(u[2], b[2]);
    u[3] = Math.max(u[3], b[3]);
  }
  return u;
}

export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function pointInPolygon(x: number, y: number, poly: number[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const xi = poly[i], yi = poly[i + 1], xj = poly[j], yj = poly[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** A polyline in page coordinates for any ink object, used for hit testing. */
export function shapePolyline(s: ShapeObject): number[] {
  const { x1, y1, x2, y2 } = s;
  if (s.shape === 'line' || s.shape === 'arrow') return [x1, y1, x2, y2];
  if (s.shape === 'rect') return [x1, y1, x2, y1, x2, y2, x1, y2, x1, y1];
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, rx = Math.abs(x2 - x1) / 2, ry = Math.abs(y2 - y1) / 2;
  const out: number[] = [];
  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    out.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
  }
  return out;
}

/** True if an ink object passes within `r` page units of the point. */
export function inkHitsCircle(o: StrokeObject | ShapeObject, x: number, y: number, r: number): boolean {
  const reach = r + o.width / 2;
  const b = objectBbox(o);
  if (x < b[0] - reach || x > b[2] + reach || y < b[1] - reach || y > b[3] + reach) return false;
  if (o.type === 'stroke') {
    const n = o.pts.length;
    if (n === POINT_STRIDE) return Math.hypot(o.pts[0] - x, o.pts[1] - y) <= reach;
    for (let i = POINT_STRIDE; i < n; i += POINT_STRIDE) {
      if (distToSegment(x, y, o.pts[i - POINT_STRIDE], o.pts[i - POINT_STRIDE + 1], o.pts[i], o.pts[i + 1]) <= reach) return true;
    }
    return false;
  }
  const line = shapePolyline(o);
  for (let i = 2; i < line.length; i += 2) {
    if (distToSegment(x, y, line[i - 2], line[i - 1], line[i], line[i + 1]) <= reach) return true;
  }
  return false;
}

/** Lasso rule: most of a stroke's points must be inside. Boxes use their center and corners. */
export function objectInLasso(o: PageObject, poly: number[]): boolean {
  const b = objectBbox(o);
  const lb = polygonBbox(poly);
  if (!bboxesIntersect(b, lb)) return false;
  if (o.type === 'stroke') {
    let inside = 0, total = 0;
    const step = Math.max(1, Math.floor(o.pts.length / POINT_STRIDE / 32)) * POINT_STRIDE;
    for (let i = 0; i < o.pts.length; i += step) {
      total++;
      if (pointInPolygon(o.pts[i], o.pts[i + 1], poly)) inside++;
    }
    return inside / total >= 0.6;
  }
  if (o.type === 'shape') {
    const line = shapePolyline(o);
    let inside = 0;
    for (let i = 0; i < line.length; i += 2) if (pointInPolygon(line[i], line[i + 1], poly)) inside++;
    return inside / (line.length / 2) >= 0.6;
  }
  return pointInPolygon((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, poly);
}

function polygonBbox(poly: number[]): Bbox {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < poly.length; i += 2) {
    x0 = Math.min(x0, poly[i]);
    x1 = Math.max(x1, poly[i]);
    y0 = Math.min(y0, poly[i + 1]);
    y1 = Math.max(y1, poly[i + 1]);
  }
  return [x0, y0, x1, y1];
}

export interface Transform {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
}

/** Returns a copy of the object moved and scaled by the transform. */
export function transformObject(o: PageObject, m: Transform): PageObject {
  const X = (x: number) => x * m.sx + m.tx;
  const Y = (y: number) => y * m.sy + m.ty;
  const s = Math.sqrt(Math.abs(m.sx * m.sy));
  if (o.type === 'stroke') {
    const pts = new Float32Array(o.pts);
    for (let i = 0; i < pts.length; i += POINT_STRIDE) {
      pts[i] = X(pts[i]);
      pts[i + 1] = Y(pts[i + 1]);
    }
    return { ...o, pts, width: o.width * s, bbox: pointsBbox(pts, strokePad(o.width * s)) };
  }
  if (o.type === 'shape') return { ...o, x1: X(o.x1), y1: Y(o.y1), x2: X(o.x2), y2: Y(o.y2), width: o.width * s };
  const base = { ...o, x: X(o.x), y: Y(o.y), w: o.w * m.sx, h: o.h * m.sy };
  return o.type === 'image' ? base as PageObject : { ...base, scale: (o as { scale: number }).scale * m.sy } as PageObject;
}
