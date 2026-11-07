import { create } from 'zustand';
import { db } from '../db/schema.ts';
import type { Brush, ShapeKind, ToolConfig, ToolKind } from './types.ts';

export const PEN_COLORS = ['auto', '#2F55B5', '#C62828', '#2E7D32', '#6E3FB5', '#C25E12'];
export const HIGHLIGHT_COLORS = ['#FFE14D', '#A6E87D', '#86CFFA', '#FFA8C9', '#FFC06B', '#C9A6FF'];

export interface Favorite {
  kind: ToolKind;
  brush: Brush;
  color: string;
  width: number;
}

interface ToolValues {
  kind: ToolKind;
  brush: Brush;
  shape: ShapeKind;
  penColor: string;
  hlColor: string;
  shapeColor: string;
  penWidth: number;
  hlWidth: number;
  eraserWidth: number;
  shapeWidth: number;
  customColors: string[];
  favorites: Favorite[];
}

const DEFAULTS: ToolValues = {
  kind: 'pen',
  brush: 'ballpoint',
  shape: 'rect',
  penColor: 'auto',
  hlColor: HIGHLIGHT_COLORS[0],
  shapeColor: 'auto',
  penWidth: 2.5,
  hlWidth: 20,
  eraserWidth: 10,
  shapeWidth: 2.5,
  customColors: [],
  favorites: [
    { kind: 'pen', brush: 'ballpoint', color: 'auto', width: 2.5 },
    { kind: 'pen', brush: 'fountain', color: '#2F55B5', width: 2.5 },
    { kind: 'pen', brush: 'ballpoint', color: '#C62828', width: 2 },
    { kind: 'highlighter', brush: 'highlighter', color: HIGHLIGHT_COLORS[0], width: 20 },
  ],
};

interface ToolStore extends ToolValues {
  load: () => Promise<void>;
  patch: (p: Partial<ToolValues>) => void;
}

export const useInkTools = create<ToolStore>((set, get) => ({
  ...DEFAULTS,
  load: async () => {
    const row = await db.kv.get('inkTools');
    if (row?.value) set(row.value as Partial<ToolValues>);
  },
  patch: (p) => {
    set(p);
    const { load: _l, patch: _p, ...values } = get();
    void db.kv.put({ key: 'inkTools', value: values });
  },
}));

export function selectToolConfig(s: ToolValues): ToolConfig {
  switch (s.kind) {
    case 'highlighter': return { kind: s.kind, brush: 'highlighter', color: s.hlColor, width: s.hlWidth, shape: s.shape };
    case 'eraser':
    case 'pixel-eraser': return { kind: s.kind, brush: s.brush, color: 'auto', width: s.eraserWidth, shape: s.shape };
    case 'shape': return { kind: s.kind, brush: s.brush, color: s.shapeColor, width: s.shapeWidth, shape: s.shape };
    default: return { kind: s.kind, brush: s.brush, color: s.penColor, width: s.penWidth, shape: s.shape };
  }
}
