import { newId } from '../app/ids.ts';
import { db } from '../db/schema.ts';

const MAX_SIDE = 1800;

/** Scales large photos down before storing them: a 12 MP photo would cost far more than the page is worth. */
export async function storeImage(file: Blob): Promise<{ id: string; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * ratio);
  const height = Math.round(bitmap.height * ratio);
  let blob = file;
  if (ratio < 1) {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    c.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
    blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not resize the image.'))), 'image/jpeg', 0.88));
  }
  bitmap.close();
  const id = newId();
  await db.images.add({ id, blob, createdAt: Date.now() });
  return { id, width, height };
}

const urls = new Map<string, Promise<string | null>>();

export function imageUrl(id: string): Promise<string | null> {
  let p = urls.get(id);
  if (!p) {
    p = db.images.get(id).then((row) => (row ? URL.createObjectURL(row.blob) : null));
    urls.set(id, p);
  }
  return p;
}
