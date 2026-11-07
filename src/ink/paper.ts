import { PAGE_WIDTH, SHEET_HEIGHT, type Bbox, type PageMeta } from './types.ts';
import type { PaperColor, PaperTemplate } from '../db/schema.ts';

export const PAPER_COLORS: Record<PaperColor, { fill: string; line: string; strong: string; margin: string }> = {
  white: { fill: '#FFFFFF', line: 'rgba(58, 96, 170, 0.32)', strong: 'rgba(58, 96, 170, 0.55)', margin: 'rgba(200, 60, 60, 0.42)' },
  cream: { fill: '#FBF6E7', line: 'rgba(120, 100, 60, 0.3)', strong: 'rgba(120, 100, 60, 0.55)', margin: 'rgba(180, 70, 50, 0.4)' },
  dark: { fill: '#1C1F29', line: 'rgba(170, 185, 225, 0.2)', strong: 'rgba(170, 185, 225, 0.4)', margin: 'rgba(235, 120, 120, 0.32)' },
};

const RULE: Partial<Record<PaperTemplate, number>> = { college: 27, wide: 34 };
const GRID = 24;
const TOP_MARGIN = 74;
const LEFT_MARGIN = 92;

function hLines(ctx: CanvasRenderingContext2D, x0: number, x1: number, from: number, to: number, step: number, start: number) {
  const first = start + Math.ceil((from - start) / step) * step;
  for (let y = first; y <= to; y += step) {
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
  }
}

/** Draws the visible part of the paper. Coordinates are page units, so everything scales with zoom. */
export function drawPaper(ctx: CanvasRenderingContext2D, meta: PageMeta, rect: Bbox, scale: number) {
  const colors = PAPER_COLORS[meta.paperColor];
  const height = meta.sheets * SHEET_HEIGHT;
  const y0 = Math.max(0, rect[1]);
  const y1 = Math.min(height, rect[3]);
  ctx.fillStyle = colors.fill;
  ctx.fillRect(0, 0, PAGE_WIDTH, height);
  const hair = Math.max(0.8, 0.9 / scale);

  for (let sheet = Math.floor(y0 / SHEET_HEIGHT); sheet * SHEET_HEIGHT < y1; sheet++) {
    const top = sheet * SHEET_HEIGHT;
    const bottom = top + SHEET_HEIGHT;
    const from = Math.max(y0, top);
    const to = Math.min(y1, bottom);
    const t = meta.template;

    ctx.lineWidth = hair;
    ctx.strokeStyle = colors.line;
    ctx.beginPath();
    if (RULE[t]) {
      hLines(ctx, 0, PAGE_WIDTH, Math.max(from, top + TOP_MARGIN), Math.min(to, bottom - 40), RULE[t]!, top + TOP_MARGIN);
    } else if (t === 'grid') {
      hLines(ctx, 0, PAGE_WIDTH, from, to, GRID, top);
      for (let x = 0; x <= PAGE_WIDTH; x += GRID) {
        ctx.moveTo(x, from);
        ctx.lineTo(x, to);
      }
    } else if (t === 'cornell') {
      hLines(ctx, 232, PAGE_WIDTH, Math.max(from, top + 110), Math.min(to, bottom - 210), 27, top + 110);
    }
    ctx.stroke();

    if (t === 'dot') {
      ctx.fillStyle = colors.strong;
      const r = Math.max(1, 1.1 / Math.sqrt(scale));
      const first = top + Math.ceil((from - top) / GRID) * GRID;
      ctx.beginPath();
      for (let y = first; y <= to; y += GRID) {
        for (let x = GRID; x < PAGE_WIDTH; x += GRID) {
          ctx.moveTo(x + r, y);
          ctx.arc(x, y, r, 0, Math.PI * 2);
        }
      }
      ctx.fill();
    }

    if (RULE[t]) {
      ctx.strokeStyle = colors.margin;
      ctx.lineWidth = hair * 1.2;
      ctx.beginPath();
      ctx.moveTo(LEFT_MARGIN, from);
      ctx.lineTo(LEFT_MARGIN, to);
      ctx.stroke();
    }

    if (t === 'cornell') {
      ctx.strokeStyle = colors.strong;
      ctx.lineWidth = hair * 1.5;
      ctx.beginPath();
      // Title band, cue column and summary band.
      ctx.moveTo(0, top + 83);
      ctx.lineTo(PAGE_WIDTH, top + 83);
      ctx.moveTo(232, top + 83);
      ctx.lineTo(232, bottom - 190);
      ctx.moveTo(0, bottom - 190);
      ctx.lineTo(PAGE_WIDTH, bottom - 190);
      ctx.stroke();
    }

    // The tear between sheets.
    if (sheet > 0 && top >= y0 && top <= y1) {
      ctx.strokeStyle = colors.strong;
      ctx.lineWidth = hair * 1.2;
      ctx.setLineDash([10 / scale, 7 / scale]);
      ctx.beginPath();
      ctx.moveTo(0, top);
      ctx.lineTo(PAGE_WIDTH, top);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}
