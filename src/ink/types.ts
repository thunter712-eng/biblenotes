import type { VerseRef } from '../bible/refs.ts';
import type { PaperColor, PaperTemplate } from '../db/schema.ts';

export type Brush = 'ballpoint' | 'fountain' | 'pencil' | 'highlighter';
export type ShapeKind = 'line' | 'rect' | 'ellipse' | 'arrow';
export type Bbox = [number, number, number, number];

/** Flat [x, y, pressure, t, x, y, pressure, t, ...] with t in ms since the stroke began. */
export type Points = Float32Array;
export const POINT_STRIDE = 4;

interface Base {
  id: string;
  /** Paint order. Equal values fall back to id order. */
  z: number;
}

export interface StrokeObject extends Base {
  type: 'stroke';
  brush: Brush;
  color: string;
  width: number;
  /** True when pressure is simulated from speed, as with a mouse or finger. */
  sim: boolean;
  pts: Points;
  bbox: Bbox;
}

export interface ShapeObject extends Base {
  type: 'shape';
  shape: ShapeKind;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
  highlighter: boolean;
}

export interface TextBoxObject extends Base {
  type: 'text';
  x: number;
  y: number;
  w: number;
  h: number;
  /** Tiptap JSON. */
  content: unknown;
  text: string;
  scale: number;
}

export interface ImageObject extends Base {
  type: 'image';
  x: number;
  y: number;
  w: number;
  h: number;
  imageId: string;
}

export interface QuoteObject extends Base {
  type: 'quote';
  x: number;
  y: number;
  w: number;
  h: number;
  startRef: VerseRef;
  endRef: VerseRef;
  label: string;
  abbr: string;
  text: string;
  scale: number;
}

export type PageObject = StrokeObject | ShapeObject | TextBoxObject | ImageObject | QuoteObject;
export type BoxObject = TextBoxObject | ImageObject | QuoteObject;

export const isBox = (o: PageObject): o is BoxObject => o.type === 'text' || o.type === 'image' || o.type === 'quote';
export const isHighlighter = (o: PageObject): boolean =>
  (o.type === 'stroke' && o.brush === 'highlighter') || (o.type === 'shape' && o.highlighter);

export interface PageMeta {
  template: PaperTemplate;
  paperColor: PaperColor;
  sheets: number;
}

export const PAGE_WIDTH = 816;
export const SHEET_HEIGHT = 1056;

export type ToolKind = 'pen' | 'highlighter' | 'eraser' | 'pixel-eraser' | 'lasso' | 'text' | 'shape';

export interface ToolConfig {
  kind: ToolKind;
  brush: Brush;
  color: string;
  width: number;
  shape: ShapeKind;
}
