import { expect, it } from 'vitest';
import { buildPdf } from './pdf.ts';

const latin = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join('');

it('writes a structurally valid PDF with one page per image', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
  const pdf = latin(buildPdf([{ jpeg, width: 200, height: 300 }, { jpeg, width: 200, height: 100 }], 612));
  expect(pdf.startsWith('%PDF-1.4')).toBe(true);
  expect(pdf).toContain('/Count 2');
  expect(pdf).toContain('/MediaBox [0 0 612 918.00]');
  expect(pdf).toContain('/MediaBox [0 0 612 306.00]');
  expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);

  // Every xref entry must point at the object it names, and startxref at the table.
  const start = +/startxref\n(\d+)/.exec(pdf)![1];
  expect(pdf.slice(start, start + 4)).toBe('xref');
  const lines = pdf.slice(start).split('\n');
  const count = +lines[1].split(' ')[1];
  for (let id = 1; id < count; id++) {
    const offset = +lines[2 + id].slice(0, 10);
    expect(pdf.slice(offset, offset + `${id} 0 obj`.length)).toBe(`${id} 0 obj`);
  }
});
