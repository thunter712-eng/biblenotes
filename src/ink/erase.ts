import { newId } from '../app/ids.ts';
import { pointsBbox, shapePolyline, strokePad } from './geometry.ts';
import { POINT_STRIDE, type Points, type ShapeObject, type StrokeObject } from './types.ts';

/** Turns a shape into an equivalent stroke, so the pixel eraser can cut it. */
export function shapeToStroke(s: ShapeObject): StrokeObject {
  const line = shapePolyline(s);
  const pts = new Float32Array((line.length / 2) * POINT_STRIDE);
  for (let i = 0; i < line.length / 2; i++) {
    pts[i * POINT_STRIDE] = line[i * 2];
    pts[i * POINT_STRIDE + 1] = line[i * 2 + 1];
    pts[i * POINT_STRIDE + 2] = 0.5;
    pts[i * POINT_STRIDE + 3] = i;
  }
  const dense = densify(pts, Math.max(2, s.width));
  return {
    type: 'stroke', id: newId(), z: s.z, brush: s.highlighter ? 'highlighter' : 'ballpoint', color: s.color, width: s.width,
    sim: false, pts: dense, bbox: pointsBbox(dense, strokePad(s.width)),
  };
}

/** Inserts interpolated points so no segment is longer than maxStep. */
export function densify(pts: Points, maxStep: number): Points {
  const out: number[] = [];
  const n = pts.length / POINT_STRIDE;
  for (let i = 0; i < n; i++) {
    const a = i * POINT_STRIDE;
    if (i > 0) {
      const p = a - POINT_STRIDE;
      const d = Math.hypot(pts[a] - pts[p], pts[a + 1] - pts[p + 1]);
      const extra = Math.floor(d / maxStep);
      for (let k = 1; k <= extra; k++) {
        const t = k / (extra + 1);
        out.push(
          pts[p] + (pts[a] - pts[p]) * t,
          pts[p + 1] + (pts[a + 1] - pts[p + 1]) * t,
          pts[p + 2] + (pts[a + 2] - pts[p + 2]) * t,
          pts[p + 3] + (pts[a + 3] - pts[p + 3]) * t,
        );
      }
    }
    out.push(pts[a], pts[a + 1], pts[a + 2], pts[a + 3]);
  }
  return Float32Array.from(out);
}

/**
 * Vector "pixel" eraser. Cuts the points within `r` of (x, y) out of a stroke and returns the pieces
 * as new strokes, or null if the circle misses it. Fragments of a single point are dropped.
 */
export function cutStroke(stroke: StrokeObject, x: number, y: number, r: number): StrokeObject[] | null {
  const reach = r + stroke.width * 0.4;
  const pts = densify(stroke.pts, Math.max(0.75, reach / 3));
  const n = pts.length / POINT_STRIDE;
  const pieces: number[][] = [];
  let current: number[] | null = null;
  let cut = false;
  for (let i = 0; i < n; i++) {
    const a = i * POINT_STRIDE;
    if (Math.hypot(pts[a] - x, pts[a + 1] - y) <= reach) {
      cut = true;
      current = null;
    } else {
      if (!current) {
        current = [];
        pieces.push(current);
      }
      current.push(pts[a], pts[a + 1], pts[a + 2], pts[a + 3]);
    }
  }
  if (!cut) return null;
  return pieces
    .filter((p) => p.length >= POINT_STRIDE * 2)
    .map((p) => {
      const f = Float32Array.from(p);
      return { ...stroke, id: newId(), pts: f, bbox: pointsBbox(f, strokePad(stroke.width)) };
    });
}
