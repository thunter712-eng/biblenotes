import { useEffect, useRef, useState, type ReactNode } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import type { Editor, JSONContent } from '@tiptap/core';
import { editorExtensions } from './extensions.ts';
import { EditorToolbar } from './EditorToolbar.tsx';

export function RichEditor({ content, onChange, autoFocus, placeholder, renderToolbar, onBlurOutside }: {
  content: unknown;
  onChange: (json: JSONContent, text: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
  /** Lets a parent put the toolbar somewhere else, as the notebook's text boxes do. */
  renderToolbar?: (editor: Editor) => ReactNode;
  onBlurOutside?: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    extensions: editorExtensions,
    content: (content as JSONContent | null | undefined) ?? '',
    autofocus: autoFocus ? 'end' : false,
    shouldRerenderOnTransaction: true,
    editorProps: { attributes: { class: 'rich-text', 'aria-label': placeholder ?? 'Note text', autocapitalize: 'sentences' } },
    onUpdate: ({ editor: e }) => onChangeRef.current(e.getJSON(), e.getText({ blockSeparator: '\n' })),
    onFocus: () => setFocused(true),
  });

  // Blur is judged by where focus lands, because tapping a toolbar select also blurs the editor.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (wrap.current?.contains(e.target as Node)) return;
      if ((e.target as HTMLElement).closest?.('[data-editor-chrome]')) return;
      setFocused(false);
      onBlurOutside?.();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [onBlurOutside]);

  const isEmpty = editor?.isEmpty;
  return (
    <div className={`rich-editor ${focused ? 'is-focused' : ''} ${isEmpty ? 'is-empty' : ''}`} ref={wrap} data-placeholder={placeholder}>
      {focused && editor && (renderToolbar ? renderToolbar(editor) : <EditorToolbar editor={editor} />)}
      <EditorContent editor={editor} />
    </div>
  );
}
