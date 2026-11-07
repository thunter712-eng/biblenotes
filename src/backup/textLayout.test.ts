import { describe, expect, it } from 'vitest';
import { layoutRichText } from './textLayout.ts';

// Fixed-width font: every character is 10 units wide.
const measure = (t: string) => t.length * 10;
const style = { family: 'Serif', size: 18, color: '#000', resolveColor: (c: string) => (c === 'var(--hl-yellow)' ? '#ff0' : c) };
const doc = (...content: unknown[]) => ({ type: 'doc', content });
const p = (...content: unknown[]) => ({ type: 'paragraph', content });
const text = (t: string, marks?: unknown[]) => ({ type: 'text', text: t, marks });
const lineText = (l: { runs: { run: { text: string } }[] }) => l.runs.map((r) => r.run.text).join('');

describe('rich text layout', () => {
  it('wraps at word boundaries', () => {
    const lines = layoutRichText(doc(p(text('one two three four'))), 90, style, measure);
    expect(lines.map(lineText).map((s) => s.trim())).toEqual(['one two', 'three', 'four']);
  });
  it('breaks a word too long for the line', () => {
    const lines = layoutRichText(doc(p(text('abcdefghijkl'))), 50, style, measure);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.map(lineText).join('')).toBe('abcdefghijkl');
    for (const l of lines) expect(l.width).toBeLessThanOrEqual(50);
  });
  it('applies marks to the font and colors', () => {
    const [line] = layoutRichText(doc(p(
      text('b ', [{ type: 'bold' }]),
      text('i ', [{ type: 'italic' }]),
      text('h', [{ type: 'highlight', attrs: { color: 'var(--hl-yellow)' } }, { type: 'textStyle', attrs: { fontFamily: 'Caveat', color: '#f00' } }]),
    )), 500, style, measure);
    expect(line.runs[0].run.font).toContain('700');
    expect(line.runs[1].run.font).toContain('italic');
    expect(line.runs[2].run.font).toContain('Caveat');
    expect(line.runs[2].run.background).toBe('#ff0');
    expect(line.runs[2].run.color).toBe('#f00');
  });
  it('makes headings larger and bold', () => {
    const [line] = layoutRichText(doc({ type: 'heading', attrs: { level: 1 }, content: [text('Title')] }), 500, style, measure);
    expect(line.runs[0].run.size).toBeCloseTo(28.8);
    expect(line.runs[0].run.font).toContain('700');
  });
  it('indents lists and adds markers', () => {
    const lines = layoutRichText(doc({ type: 'orderedList', content: [{ type: 'listItem', content: [p(text('a'))] }, { type: 'listItem', content: [p(text('b'))] }] }), 500, style, measure);
    expect(lines.map((l) => l.marker?.text)).toEqual(['1.', '2.']);
    expect(lines[0].indent).toBeGreaterThan(0);
  });
  it('shows task list state', () => {
    const lines = layoutRichText(doc({ type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [p(text('done'))] }] }), 500, style, measure);
    expect(lines[0].marker?.text).toBe('☑');
  });
  it('keeps an empty paragraph as a blank line', () => {
    expect(layoutRichText(doc(p(), p(text('x'))), 500, style, measure).length).toBe(2);
  });
  it('copes with empty content', () => {
    expect(layoutRichText(null, 500, style, measure)).toEqual([]);
  });
});
