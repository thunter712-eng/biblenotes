import { pointsBbox } from './geometry.ts';
import { POINT_STRIDE, type Points, type ShapeKind } from './types.ts';

export interface RecognizedShape {
  shape: ShapeKind;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Hold-to-snap recognizer. Works on the shape's own proportions, so size doesn't matter.
 * Returns null when nothing fits well: leaving the ink alone beats guessing.
 */
export function recognizeShape(pts: Points): RecognizedShape | null {
  const n = pts.length / POINT_STRIDE;
  if (n < 4) return null;
  const at = (i: number) => [pts[i * POINT_STRIDE], pts[i * POINT_STRIDE + 1]] as const;
  const [sx, sy] = at(0);
  const [ex, ey] = at(n - 1);
  let perimeter = 0;
  for (let i = 1; i < n; i++) {
    const [a, b] = at(i - 1);
    const [c, d] = at(i);
    perimeter += Math.hypot(c - a, d - b);
  }
  if (perimeter < 16) return null;
  const chord = Math.hypot(ex - sx, ey - sy);

  // Line: every point stays close to the chord.
  if (chord / perimeter > 0.8) {
    let maxDev = 0;
    for (let i = 1; i < n - 1; i++) {
      const [x, y] = at(i);
      maxDev = Math.max(maxDev, Math.abs((ex - sx) * (sy - y) - (sx - x) * (ey - sy)) / (chord || 1));
    }
    if (maxDev / chord < 0.07) return { shape: 'line', x1: sx, y1: sy, x2: ex, y2: ey };
    return null;
  }

  // Closed shapes must nearly return to their start.
  if (chord / perimeter > 0.2) return null;
  const [x0, y0, x1, y1] = pointsBbox(pts);
  const w = x1 - x0, h = y1 - y0;
  if (w < 8 || h < 8) return null;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = w / 2, ry = h / 2;

  let ellipseError = 0, rectError = 0;
  for (let i = 0; i < n; i++) {
    const [x, y] = at(i);
    const nx = (x - cx) / rx, ny = (y - cy) / ry;
    ellipseError += Math.abs(Math.hypot(nx, ny) - 1);
    rectError += Math.abs(Math.max(Math.abs(nx), Math.abs(ny)) - 1);
  }
  ellipseError /= n;
  rectError /= n;
  if (Math.min(ellipseError, rectError) > 0.16) return null;
  return { shape: rectError < ellipseError ? 'rect' : 'ellipse', x1: x0, y1: y0, x2: x1, y2: y1 };
}
