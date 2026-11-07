export interface PdfImage {
  jpeg: Uint8Array;
  /** Pixel size of the JPEG. */
  width: number;
  height: number;
}

const enc = new TextEncoder();

/**
 * A minimal PDF writer: one JPEG per page, carried as-is using DCTDecode. Each page is rendered
 * at high resolution first, so what prints is exactly what the screen shows, blended highlighter included.
 */
export function buildPdf(images: PdfImage[], pageWidthPt: number): Uint8Array {
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const write = (d: string | Uint8Array) => {
    const b = typeof d === 'string' ? enc.encode(d) : d;
    chunks.push(b);
    length += b.length;
  };
  const object = (id: number, body: () => void) => {
    offsets[id] = length;
    write(`${id} 0 obj\n`);
    body();
    write('\nendobj\n');
  };

  // Objects: 1 catalog, 2 page tree, then for each page: page, contents, image.
  const pageId = (i: number) => 3 + i * 3;
  write('%PDF-1.4\n%\xC7\xEC\x8F\xA2\n');
  object(1, () => write('<< /Type /Catalog /Pages 2 0 R >>'));
  object(2, () => write(`<< /Type /Pages /Count ${images.length} /Kids [${images.map((_, i) => `${pageId(i)} 0 R`).join(' ')}] >>`));
  images.forEach((img, i) => {
    const h = (pageWidthPt * img.height) / img.width;
    const id = pageId(i);
    object(id, () => write(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidthPt} ${h.toFixed(2)}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`));
    const content = `q ${pageWidthPt} 0 0 ${h.toFixed(2)} 0 0 cm /Im0 Do Q`;
    object(id + 1, () => write(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    object(id + 2, () => {
      write(`<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.jpeg.length} >>\nstream\n`);
      write(img.jpeg);
      write('\nendstream');
    });
  });
  const xref = length;
  const count = 3 + images.length * 3;
  write(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let i = 1; i < count; i++) write(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  write(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}
