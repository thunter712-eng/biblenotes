/**
 * Draws Tiptap JSON onto a canvas for export. Safari taints canvases that draw SVG foreignObject, so
 * the live DOM can't be captured. This is a small line-breaker that covers what the editor can produce.
 */

export interface Mark {
  type: string;
  attrs?: Record<string, unknown>;
}

interface JsonNode {
  type: string;
  text?: string;
  marks?: Mark[];
  attrs?: Record<string, unknown>;
  content?: JsonNode[];
}

export interface Run {
  text: string;
  font: string;
  size: number;
  color: string;
  background?: string;
  underline?: boolean;
  strike?: boolean;
}

export interface Line {
  runs: { run: Run; x: number; width: number }[];
  width: number;
  height: number;
  ascent: number;
  align: string;
  indent: number;
  marker?: { text: string; font: string; color: string };
}

export interface TextStyle {
  family: string;
  size: number;
  color: string;
  resolveColor: (c: string) => string;
}

type Measure = (text: string, font: string) => number;

function runFrom(text: string, marks: Mark[] | undefined, base: { family: string; size: number; color: string; bold: boolean }, resolve: (c: string) => string): Run {
  let family = base.family;
  let size = base.size;
  let color = base.color;
  let bold = base.bold;
  let italic = false;
  const out: Partial<Run> = {};
  for (const m of marks ?? []) {
    if (m.type === 'bold') bold = true;
    else if (m.type === 'italic') italic = true;
    else if (m.type === 'underline') out.underline = true;
    else if (m.type === 'strike') out.strike = true;
    else if (m.type === 'highlight') out.background = resolve((m.attrs?.color as string) ?? 'var(--hl-yellow)');
    else if (m.type === 'textStyle') {
      if (m.attrs?.fontFamily) family = m.attrs.fontFamily as string;
      if (m.attrs?.fontSize) size = (parseFloat(m.attrs.fontSize as string) || size) * (base.size / 18);
      if (m.attrs?.color) color = resolve(m.attrs.color as string);
    }
  }
  return { text, font: `${italic ? 'italic ' : ''}${bold ? '700 ' : ''}${size}px ${family}`, size, color, ...out };
}

const HEADING_SCALE: Record<number, number> = { 1: 1.6, 2: 1.32, 3: 1.12 };

/** Lays rich content out into lines within `width`. Pure apart from the supplied measure function. */
export function layoutRichText(content: unknown, width: number, style: TextStyle, measure: Measure): Line[] {
  const lines: Line[] = [];

  const flow = (runs: Run[], align: string, indent: number, marker?: Line['marker']) => {
    const maxWidth = Math.max(10, width - indent);
    let cur: Line['runs'] = [];
    let curWidth = 0;
    let first = true;
    const push = () => {
      const size = Math.max(style.size, ...cur.map((c) => c.run.size));
      lines.push({ runs: cur, width: curWidth, height: size * 1.35, ascent: size * 1.02, align, indent, ...(first && marker ? { marker } : {}) });
      first = false;
      cur = [];
      curWidth = 0;
    };
    for (const run of runs) {
      // Split on spaces, keeping each trailing space with its word, then re-join runs of one style.
      for (const token of run.text.match(/\S+\s*|\s+/g) ?? []) {
        let w = measure(token, run.font);
        const trimmedWidth = measure(token.trimEnd(), run.font);
        if (curWidth + trimmedWidth > maxWidth && cur.length) push();
        let rest = token;
        // A single word wider than the line breaks character by character.
        while (measure(rest.trimEnd(), run.font) > maxWidth && rest.length > 1) {
          let n = rest.length - 1;
          while (n > 1 && measure(rest.slice(0, n), run.font) > maxWidth - curWidth) n--;
          const piece = rest.slice(0, n);
          cur.push({ run: { ...run, text: piece }, x: curWidth, width: measure(piece, run.font) });
          curWidth += measure(piece, run.font);
          push();
          rest = rest.slice(n);
        }
        w = measure(rest, run.font);
        cur.push({ run: { ...run, text: rest }, x: curWidth, width: w });
        curWidth += w;
      }
    }
    if (cur.length || first) push();
  };

  const inlineRuns = (node: JsonNode, bold: boolean, size: number): Run[] =>
    (node.content ?? []).flatMap((n) => {
      if (n.type === 'text' && n.text) return [runFrom(n.text, n.marks, { family: style.family, size, color: style.color, bold }, style.resolveColor)];
      if (n.type === 'hardBreak') return [runFrom(' ', undefined, { family: style.family, size, color: style.color, bold }, style.resolveColor)];
      return [];
    });

  const block = (node: JsonNode, indent: number, marker?: Line['marker']) => {
    const align = (node.attrs?.textAlign as string) || 'left';
    switch (node.type) {
      case 'paragraph':
        flow(inlineRuns(node, false, style.size), align, indent, marker);
        break;
      case 'heading': {
        const level = (node.attrs?.level as number) ?? 1;
        flow(inlineRuns(node, true, style.size * (HEADING_SCALE[level] ?? 1)), align, indent, marker);
        break;
      }
      case 'bulletList':
        (node.content ?? []).forEach((li) => listItem(li, indent + style.size * 1.4, '•'));
        break;
      case 'orderedList':
        (node.content ?? []).forEach((li, i) => listItem(li, indent + style.size * 1.4, `${((node.attrs?.start as number) ?? 1) + i}.`));
        break;
      case 'taskList':
        (node.content ?? []).forEach((li) => listItem(li, indent + style.size * 1.4, li.attrs?.checked ? '☑' : '☐'));
        break;
      default:
        (node.content ?? []).forEach((c) => block(c, indent));
    }
  };

  const listItem = (li: JsonNode, indent: number, text: string) => {
    (li.content ?? []).forEach((child, i) => block(child, indent, i === 0 ? { text, font: `${style.size}px ${style.family}`, color: style.color } : undefined));
  };

  const doc = content as JsonNode | null;
  (doc?.content ?? []).forEach((n) => block(n, 0));
  return lines;
}

export function drawLines(ctx: CanvasRenderingContext2D, lines: Line[], x: number, y: number, width: number): number {
  let cy = y;
  ctx.textBaseline = 'alphabetic';
  for (const line of lines) {
    const free = width - line.indent - line.width;
    const offset = line.align === 'center' ? free / 2 : line.align === 'right' ? free : 0;
    const baseline = cy + line.ascent;
    if (line.marker) {
      ctx.font = line.marker.font;
      ctx.fillStyle = line.marker.color;
      ctx.textAlign = 'right';
      ctx.fillText(line.marker.text, x + line.indent - 5, baseline);
      ctx.textAlign = 'left';
    }
    for (const { run, x: rx, width: w } of line.runs) {
      const px = x + line.indent + offset + rx;
      if (run.background) {
        ctx.fillStyle = run.background;
        ctx.fillRect(px, cy + 1, w, line.height - 2);
      }
      ctx.font = run.font;
      ctx.fillStyle = run.color;
      ctx.fillText(run.text, px, baseline);
      if (run.underline || run.strike) {
        ctx.fillRect(px, run.underline ? baseline + run.size * 0.1 : baseline - run.size * 0.28, w, Math.max(1, run.size * 0.06));
      }
    }
    cy += line.height;
  }
  return cy - y;
}
