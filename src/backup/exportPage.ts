import { zipSync, type Zippable } from 'fflate';
import { db, type Notebook, type Page } from '../db/schema.ts';
import { fontCss } from '../app/fonts.ts';
import { drawInk } from '../ink/brushes.ts';
import { objectBbox } from '../ink/geometry.ts';
import { drawPaper } from '../ink/paper.ts';
import { PAGE_WIDTH, SHEET_HEIGHT, isHighlighter, type ImageObject, type PageObject, type QuoteObject, type ShapeObject, type StrokeObject, type TextBoxObject } from '../ink/types.ts';
import { imageUrl } from '../notebook/images.ts';
import { flushDocument, loadDocument } from '../notebook/pageStore.ts';
import { buildPdf, type PdfImage } from './pdf.ts';
import { safeFilename, shareOrDownload } from './share.ts';
import { drawLines, layoutRichText } from './textLayout.ts';

/** 2.5 times the page's 96-dpi size is 240 dpi, a sharp print from a file that's still a sensible size. */
const EXPORT_SCALE = 2.5;
const LETTER_WIDTH_PT = 612;
const UI_FONT = fontCss('Alegreya Sans');
const QUOTE_FONT = fontCss('EB Garamond');

function resolveCssColor(c: string): string {
  const m = /^var\((--[\w-]+)\)$/.exec(c);
  return m ? getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || '#FFE97A' : c;
}

const loadImage = (src: string) => new Promise<HTMLImageElement>((res, rej) => {
  const img = new Image();
  img.onload = () => res(img);
  img.onerror = () => rej(new Error('An image on this page could not be loaded.'));
  img.src = src;
});

function drawText(ctx: CanvasRenderingContext2D, o: TextBoxObject, dark: boolean) {
  const measure = (t: string, font: string) => {
    ctx.font = font;
    return ctx.measureText(t).width;
  };
  const lines = layoutRichText(o.content, o.w, { family: UI_FONT, size: 18 * o.scale, color: dark ? '#ECEEF4' : '#1B1F2B', resolveColor: resolveCssColor }, measure);
  drawLines(ctx, lines, o.x, o.y, o.w);
}

function drawQuote(ctx: CanvasRenderingContext2D, o: QuoteObject, dark: boolean) {
  const size = 18 * o.scale;
  const accent = dark ? '#93ABF2' : '#274A9F';
  ctx.fillStyle = dark ? 'rgba(147, 171, 242, 0.12)' : 'rgba(39, 74, 159, 0.07)';
  ctx.fillRect(o.x, o.y, o.w, o.h);
  ctx.fillStyle = accent;
  ctx.fillRect(o.x, o.y, 3, o.h);
  const measure = (t: string, font: string) => {
    ctx.font = font;
    return ctx.measureText(t).width;
  };
  const body = layoutRichText({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: o.text }] }] }, o.w - 24, { family: QUOTE_FONT, size, color: dark ? '#ECEEF4' : '#1B1F2B', resolveColor: (c) => c }, measure);
  const h = drawLines(ctx, body, o.x + 12, o.y + 8, o.w - 24);
  ctx.font = `${size * 0.78}px ${UI_FONT}`;
  ctx.fillStyle = accent;
  ctx.textAlign = 'left';
  ctx.fillText(`${o.label} (${o.abbr})`, o.x + 12, o.y + 8 + h + 5 + size * 0.78);
}

async function drawImage(ctx: CanvasRenderingContext2D, o: ImageObject) {
  const url = await imageUrl(o.imageId);
  if (url) ctx.drawImage(await loadImage(url), o.x, o.y, o.w, o.h);
}

/** Paints one sheet in the same order as the screen: paper, boxes, highlighter, ink. */
export async function renderSheet(page: Page, objects: readonly PageObject[], sheet: number, scale = EXPORT_SCALE): Promise<HTMLCanvasElement> {
  const c = document.createElement('canvas');
  c.width = Math.round(PAGE_WIDTH * scale);
  c.height = Math.round(SHEET_HEIGHT * scale);
  const ctx = c.getContext('2d')!;
  const top = sheet * SHEET_HEIGHT;
  const rect: [number, number, number, number] = [0, top, PAGE_WIDTH, top + SHEET_HEIGHT];
  const dark = page.paperColor === 'dark';
  ctx.setTransform(scale, 0, 0, scale, 0, -top * scale);
  drawPaper(ctx, { template: page.template, paperColor: page.paperColor, sheets: page.sheets }, rect, scale);

  const visible = objects.filter((o) => {
    const b = objectBbox(o);
    return b[1] <= rect[3] && b[3] >= rect[1];
  });
  for (const o of visible) {
    if (o.type === 'image') await drawImage(ctx, o);
    else if (o.type === 'text') drawText(ctx, o, dark);
    else if (o.type === 'quote') drawQuote(ctx, o, dark);
  }
  ctx.globalCompositeOperation = dark ? 'screen' : 'multiply';
  for (const o of visible) if ((o.type === 'stroke' || o.type === 'shape') && isHighlighter(o)) drawInk(ctx, o as StrokeObject | ShapeObject, dark);
  ctx.globalCompositeOperation = 'source-over';
  for (const o of visible) if ((o.type === 'stroke' || o.type === 'shape') && !isHighlighter(o)) drawInk(ctx, o as StrokeObject | ShapeObject, dark);
  return c;
}

const toBytes = async (c: HTMLCanvasElement, type: string, quality?: number) => {
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('This page is too large to export on this device.'))), type, quality));
  return new Uint8Array(await blob.arrayBuffer());
};

async function pageObjects(page: Page) {
  const doc = await loadDocument(page.id);
  await flushDocument(page.id, doc);
  return doc.objects;
}

/** Sheets beyond the first count only if something is on them. */
function usedSheets(page: Page, objects: readonly PageObject[]) {
  const bottom = objects.length ? Math.max(...objects.map((o) => objectBbox(o)[3])) : 0;
  return Math.max(1, Math.min(page.sheets, Math.floor(Math.max(0, bottom - 1) / SHEET_HEIGHT) + 1));
}

async function fontsReady() {
  await document.fonts?.ready;
}

async function sheetsAsJpeg(page: Page): Promise<PdfImage[]> {
  const objects = await pageObjects(page);
  const out: PdfImage[] = [];
  for (let s = 0; s < usedSheets(page, objects); s++) {
    const canvas = await renderSheet(page, objects, s);
    out.push({ jpeg: await toBytes(canvas, 'image/jpeg', 0.92), width: canvas.width, height: canvas.height });
    canvas.width = canvas.height = 0; // Release the memory now: iOS kills pages that hold on to many canvases.
  }
  return out;
}

export async function exportPagePdf(page: Page) {
  await fontsReady();
  const pdf = buildPdf(await sheetsAsJpeg(page), LETTER_WIDTH_PT);
  return shareOrDownload(new Blob([pdf as BlobPart], { type: 'application/pdf' }), `${safeFilename(page.title)}.pdf`);
}

async function sheetPngs(page: Page, prefix: string, zip: Zippable) {
  const objects = await pageObjects(page);
  const count = usedSheets(page, objects);
  for (let s = 0; s < count; s++) {
    const canvas = await renderSheet(page, objects, s);
    zip[`${prefix}${count > 1 ? ` ${s + 1}` : ''}.png`] = [await toBytes(canvas, 'image/png'), { level: 0 }];
    canvas.width = canvas.height = 0;
  }
  return count;
}

export async function exportPagePng(page: Page) {
  await fontsReady();
  const zip: Zippable = {};
  const name = safeFilename(page.title);
  const count = await sheetPngs(page, name, zip);
  if (count === 1) {
    const [bytes] = zip[`${name}.png`] as [Uint8Array, unknown];
    return shareOrDownload(new Blob([bytes as BlobPart], { type: 'image/png' }), `${name}.png`);
  }
  return shareOrDownload(new Blob([zipSync(zip) as BlobPart], { type: 'application/zip' }), `${name} PNG.zip`);
}

const notebookPages = (nb: Notebook) => db.pages.where('notebookId').equals(nb.id).sortBy('order');

export async function exportNotebookPdf(nb: Notebook) {
  await fontsReady();
  const pages = await notebookPages(nb);
  if (!pages.length) throw new Error('This notebook has no pages to export.');
  const images: PdfImage[] = [];
  for (const p of pages) images.push(...(await sheetsAsJpeg(p)));
  return shareOrDownload(new Blob([buildPdf(images, LETTER_WIDTH_PT) as BlobPart], { type: 'application/pdf' }), `${safeFilename(nb.title)}.pdf`);
}

export async function exportNotebookPngs(nb: Notebook) {
  await fontsReady();
  const pages = await notebookPages(nb);
  if (!pages.length) throw new Error('This notebook has no pages to export.');
  const zip: Zippable = {};
  for (const [i, p] of pages.entries()) await sheetPngs(p, `${String(i + 1).padStart(3, '0')} ${safeFilename(p.title)}`, zip);
  return shareOrDownload(new Blob([zipSync(zip) as BlobPart], { type: 'application/zip' }), `${safeFilename(nb.title)} PNG.zip`);
}
