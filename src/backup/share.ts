import { toast } from '../ui/primitives.tsx';

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/**
 * Hands a file to the Share sheet where there is one, otherwise downloads it. iOS allows sharing only
 * right after a tap, and building a big export uses that up, so a refused share gets a Save button
 * whose own tap counts as fresh permission.
 */
export async function shareOrDownload(blob: Blob, filename: string): Promise<boolean> {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return true;
    } catch (e) {
      const err = e as DOMException;
      if (err.name === 'AbortError') return false;
      if (err.name === 'NotAllowedError') {
        toast(`${filename} is ready`, {
          label: 'Save',
          run: () => {
            navigator.share({ files: [file], title: filename }).catch(() => download(blob, filename));
          },
        }, 0);
        return true;
      }
    }
  }
  download(blob, filename);
  return true;
}

export const safeFilename = (name: string) => name.replace(/[^\w\s.-]+/g, '-').replace(/\s+/g, ' ').trim() || 'export';
