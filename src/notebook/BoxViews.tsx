import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { generateHTML } from '@tiptap/core';
import type { JSONContent } from '@tiptap/core';
import { editorExtensions } from '../editor/extensions.ts';
import type { ImageObject, QuoteObject, TextBoxObject } from '../ink/types.ts';
import { imageUrl } from './images.ts';

export function richHtml(content: unknown): string {
  if (!content) return '';
  try {
    return generateHTML(content as JSONContent, editorExtensions);
  } catch {
    return '';
  }
}

const place = (o: { x: number; y: number }) => ({ left: o.x, top: o.y });

/** Reports the rendered height, so hit testing and lasso use the box's real size. */
function useMeasuredHeight(onHeight: (h: number) => void, dep: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current) onHeight(ref.current.offsetHeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dep]);
  return ref;
}

export const TextBoxView = memo(function TextBoxView({ o, hidden, onHeight }: { o: TextBoxObject; hidden: boolean; onHeight: (id: string, h: number) => void }) {
  const html = useMemo(() => richHtml(o.content), [o.content]);
  const ref = useMeasuredHeight((h) => onHeight(o.id, h), html + o.w + o.scale);
  return (
    <div
      ref={ref} data-obj-id={o.id} className="page-box page-text rich-text"
      style={{ ...place(o), width: o.w, fontSize: 18 * o.scale, transformOrigin: '0 0', visibility: hidden ? 'hidden' : undefined }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

export const QuoteView = memo(function QuoteView({ o, onHeight }: { o: QuoteObject; onHeight: (id: string, h: number) => void }) {
  const ref = useMeasuredHeight((h) => onHeight(o.id, h), o.text + o.w + o.scale);
  return (
    <div ref={ref} data-obj-id={o.id} className="page-box page-quote" style={{ ...place(o), width: o.w, fontSize: 18 * o.scale, transformOrigin: '0 0' }}>
      <blockquote>{o.text}</blockquote>
      <cite>{o.label} ({o.abbr})</cite>
    </div>
  );
});

export const ImageView = memo(function ImageView({ o }: { o: ImageObject }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => { void imageUrl(o.imageId).then(setSrc); }, [o.imageId]);
  return (
    <div data-obj-id={o.id} className="page-box page-image" style={{ ...place(o), width: o.w, height: o.h, transformOrigin: '0 0' }}>
      {src && <img src={src} alt="" draggable={false} />}
    </div>
  );
});
