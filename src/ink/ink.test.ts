import { describe, expect, it } from 'vitest';
import { decodePoints, encodePoints, fromStored, toStored } from './codec.ts';
import { PageDocument } from './document.ts';
import { cutStroke, densify, shapeToStroke } from './erase.ts';
import { inkHitsCircle, objectInLasso, pointsBbox, transformObject } from './geometry.ts';
import { recognizeShape } from './recognize.ts';
import { POINT_STRIDE, type ShapeObject, type StrokeObject } from './types.ts';

const pts = (...xy: number[]) => {
  const out = new Float32Array((xy.length / 2) * POINT_STRIDE);
  for (let i = 0; i < xy.length / 2; i++) {
    out.set([xy[i * 2], xy[i * 2 + 1], 0.5, i * 8], i * POINT_STRIDE);
  }
  return out;
};

const stroke = (id: string, p: Float32Array, z = 1): StrokeObject => ({
  type: 'stroke', id, z, brush: 'ballpoint', color: '#000', width: 2, sim: false, pts: p, bbox: pointsBbox(p, 2),
});

const polyline = (fn: (t: number) => [number, number], steps = 80) => {
  const xy: number[] = [];
  for (let i = 0; i <= steps; i++) xy.push(...fn(i / steps));
  return pts(...xy);
};

describe('codec', () => {
  it('round-trips within encoding precision', () => {
    const p = new Float32Array([10.5, 20.25, 0.5, 0, 11.0625, 19.875, 0.75, 8, -3.5, 400, 1, 16, 816, 3000, 0, 2000]);
    const back = decodePoints(encodePoints(p));
    expect(back.length).toBe(p.length);
    p.forEach((v, i) => expect(back[i]).toBeCloseTo(v, 1));
  });
  it('is much smaller than raw floats for handwriting', () => {
    const line = polyline((t) => [100 + t * 120, 200 + Math.sin(t * 20) * 8], 300);
    expect(encodePoints(line).length).toBeLessThan(line.byteLength / 2.5);
  });
  it('handles an empty stroke and whole-object round trips', () => {
    expect(decodePoints(encodePoints(new Float32Array(0))).length).toBe(0);
    const s = stroke('a', pts(1, 2, 3, 4));
    const back = fromStored(toStored(s)) as StrokeObject;
    expect(back.id).toBe('a');
    expect(back.pts[2 * 0]).toBeCloseTo(1, 1);
    expect(back.pts.length).toBe(8);
  });
});

describe('PageDocument', () => {
  it('undoes and redoes adds, removes and updates', () => {
    const doc = new PageDocument();
    const a = stroke('a', pts(0, 0, 10, 10), doc.allocZ());
    doc.commit({ removed: [], added: [a] });
    const moved = { ...a, width: 9 };
    doc.commit({ removed: [a], added: [moved] });
    expect(doc.get('a')).toBe(moved);
    doc.undo();
    expect(doc.get('a')).toBe(a);
    doc.undo();
    expect(doc.size).toBe(0);
    expect(doc.canUndo).toBe(false);
    doc.redo();
    doc.redo();
    expect(doc.get('a')).toBe(moved);
    expect(doc.canRedo).toBe(false);
  });
  it('clears redo after a new edit', () => {
    const doc = new PageDocument();
    doc.commit({ removed: [], added: [stroke('a', pts(0, 0, 1, 1))] });
    doc.undo();
    doc.commit({ removed: [], added: [stroke('b', pts(0, 0, 1, 1))] });
    expect(doc.canRedo).toBe(false);
  });
  it('tracks exactly which rows changed for autosave', () => {
    const doc = new PageDocument([stroke('old', pts(0, 0, 1, 1))]);
    doc.commit({ removed: [], added: [stroke('new', pts(0, 0, 1, 1), 5)] });
    doc.commit({ removed: [doc.get('old')!], added: [] });
    expect([...doc.dirty]).toEqual(['new']);
    expect([...doc.deleted]).toEqual(['old']);
    doc.undo();
    expect(doc.deleted.has('old')).toBe(false);
    expect(doc.dirty.has('old')).toBe(true);
  });
  it('keeps paint order when an old z returns through undo', () => {
    const doc = new PageDocument();
    const a = stroke('a', pts(0, 0, 1, 1), doc.allocZ());
    const b = stroke('b', pts(0, 0, 1, 1), doc.allocZ());
    doc.commit({ removed: [], added: [a] });
    doc.commit({ removed: [], added: [b] });
    doc.commit({ removed: [a], added: [] });
    doc.undo();
    expect(doc.objects.map((o) => o.id)).toEqual(['a', 'b']);
  });
  it('stays fast with thousands of commits', () => {
    const doc = new PageDocument();
    const start = performance.now();
    for (let i = 0; i < 5000; i++) doc.commit({ removed: [], added: [stroke(`s${i}`, pts(i, i, i + 1, i + 1), doc.allocZ())] });
    void doc.objects;
    expect(doc.size).toBe(5000);
    expect(performance.now() - start).toBeLessThan(500);
  });
});

describe('erasers', () => {
  const line = stroke('s', pts(0, 0, 100, 0));
  it('hits a stroke within reach and misses outside it', () => {
    expect(inkHitsCircle(line, 50, 4, 5)).toBe(true);
    expect(inkHitsCircle(line, 50, 20, 5)).toBe(false);
  });
  it('cuts a stroke in two', () => {
    const parts = cutStroke(line, 50, 0, 5)!;
    expect(parts.length).toBe(2);
    expect(parts[0].bbox[2]).toBeLessThan(47);
    expect(parts[1].bbox[0]).toBeGreaterThan(53);
    expect(parts[0].id).not.toBe(parts[1].id);
  });
  it('leaves a stroke alone when the circle misses', () => {
    expect(cutStroke(line, 50, 40, 5)).toBeNull();
  });
  it('removes a stroke entirely when the circle covers it', () => {
    expect(cutStroke(stroke('t', pts(0, 0, 2, 0)), 1, 0, 20)).toEqual([]);
  });
  it('densifies long segments and converts shapes for cutting', () => {
    expect(densify(pts(0, 0, 100, 0), 10).length / POINT_STRIDE).toBeGreaterThan(9);
    const shape: ShapeObject = { type: 'shape', id: 'r', z: 1, shape: 'rect', x1: 0, y1: 0, x2: 50, y2: 50, color: '#000', width: 2, highlighter: false };
    const asStroke = shapeToStroke(shape);
    expect(cutStroke(asStroke, 25, 0, 4)?.length).toBeGreaterThanOrEqual(1);
  });
});

describe('lasso and transforms', () => {
  const square = [0, 0, 100, 0, 100, 100, 0, 100];
  it('selects by majority of points inside', () => {
    expect(objectInLasso(stroke('in', pts(10, 10, 20, 20, 30, 30)), square)).toBe(true);
    expect(objectInLasso(stroke('out', pts(200, 200, 210, 210)), square)).toBe(false);
    expect(objectInLasso(stroke('edge', pts(90, 50, 110, 50, 130, 50, 150, 50, 170, 50)), square)).toBe(false);
  });
  it('moves and scales strokes, boxes and text', () => {
    const moved = transformObject(stroke('m', pts(10, 10, 20, 20)), { sx: 2, sy: 2, tx: 5, ty: 0 }) as StrokeObject;
    expect(moved.pts[0]).toBe(25);
    expect(moved.pts[5]).toBe(40);
    expect(moved.width).toBeCloseTo(4);
    const box = transformObject({ type: 'text', id: 't', z: 1, x: 10, y: 10, w: 100, h: 40, content: null, text: '', scale: 1 }, { sx: 2, sy: 2, tx: 0, ty: 0 });
    expect(box).toMatchObject({ x: 20, w: 200, h: 80, scale: 2 });
  });
});

describe('shape snap', () => {
  it('recognizes a wobbly line', () => {
    const r = recognizeShape(polyline((t) => [t * 200, 50 + Math.sin(t * 30) * 2]));
    expect(r?.shape).toBe('line');
  });
  it('recognizes an ellipse', () => {
    const r = recognizeShape(polyline((t) => [150 + Math.cos(t * 6.28) * 100, 150 + Math.sin(t * 6.28) * 60]));
    expect(r?.shape).toBe('ellipse');
  });
  it('recognizes a hand-drawn rectangle', () => {
    const r = recognizeShape(polyline((t) => {
      const s = t * 4, side = Math.floor(s) % 4, f = s - Math.floor(s);
      const wob = Math.sin(t * 90) * 1.5;
      if (side === 0) return [f * 200, wob];
      if (side === 1) return [200 + wob, f * 100];
      if (side === 2) return [200 - f * 200, 100 + wob];
      return [wob, 100 - f * 100];
    }));
    expect(r?.shape).toBe('rect');
  });
  it('ignores handwriting', () => {
    expect(recognizeShape(polyline((t) => [t * 200, 50 + Math.sin(t * 40) * 30]))).toBeNull();
  });
  it('ignores a tiny scribble', () => {
    expect(recognizeShape(pts(0, 0, 1, 1, 2, 2, 3, 3))).toBeNull();
  });
});
