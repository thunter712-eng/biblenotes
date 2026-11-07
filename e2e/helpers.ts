import type { Page } from '@playwright/test';

export interface Pt {
  x: number;
  y: number;
  pressure?: number;
}

/** Dispatches a synthetic pointer event on the ink surface, at coordinates relative to it. */
export async function pointer(page: Page, type: string, pointerType: 'pen' | 'touch' | 'mouse', id: number, x: number, y: number, pressure = 0.5, extra: Record<string, number> = {}, root = '.ink-root') {
  await page.evaluate(({ type, pointerType, id, x, y, pressure, extra, root }) => {
    const el = document.querySelector(root)!;
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, composed: true, pointerId: id, pointerType, button: 0, buttons: 1,
      clientX: r.left + x, clientY: r.top + y, pressure, width: 10, height: 10, isPrimary: true, ...extra,
    }));
  }, { type, pointerType, id, x, y, pressure, extra, root });
}

export async function penStroke(page: Page, points: Pt[], id = 1, type: 'pen' | 'mouse' | 'touch' = 'pen', root = '.ink-root') {
  const first = points[0];
  await pointer(page, 'pointerdown', type, id, first.x, first.y, first.pressure ?? 0.5, {}, root);
  for (const p of points.slice(1)) await pointer(page, 'pointermove', type, id, p.x, p.y, p.pressure ?? 0.5, {}, root);
  const last = points[points.length - 1];
  await pointer(page, 'pointerup', type, id, last.x, last.y, 0, {}, root);
}

export const line = (x0: number, y0: number, x1: number, y1: number, steps = 12, pressure?: (t: number) => number): Pt[] =>
  Array.from({ length: steps + 1 }, (_, i) => ({ x: x0 + ((x1 - x0) * i) / steps, y: y0 + ((y1 - y0) * i) / steps, pressure: pressure?.(i / steps) ?? 0.5 }));

export type InkHandle = {
  document: { size: number; canUndo: boolean; canRedo: boolean; objects: { id: string; type: string; brush?: string; color?: string; bbox?: number[]; pts?: Float32Array; x1?: number }[] };
  view: { scale: number; x: number; y: number };
  undo(): void;
  redo(): void;
  selectedIds: string[];
  benchmarkFullRender(): number;
  stats(): { liveFrameMs: number; desynchronized: boolean };
};

export const docSize = (page: Page) => page.evaluate(() => (window as unknown as { __ink: InkHandle }).__ink.document.size);
export const getView = (page: Page) => page.evaluate(() => ({ ...(window as unknown as { __ink: InkHandle }).__ink.view }));

export async function selectTool(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).first().click();
}
