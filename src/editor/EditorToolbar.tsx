import type { Editor } from '@tiptap/core';
import { FONTS } from '../app/fonts.ts';
import { IconButton } from '../ui/primitives.tsx';
import { FONT_SIZES, TEXT_COLORS, TEXT_HIGHLIGHTS } from './extensions.ts';

/** Keeps the editor's selection: toolbar taps must not move focus away from the text. */
const keepFocus = (e: React.PointerEvent | React.MouseEvent) => e.preventDefault();

export function EditorToolbar({ editor }: { editor: Editor }) {
  const chain = () => editor.chain().focus();
  const textStyle = editor.getAttributes('textStyle') as { fontFamily?: string; fontSize?: string; color?: string };
  const block = editor.isActive('heading', { level: 1 }) ? 'h1' : editor.isActive('heading', { level: 2 }) ? 'h2' : editor.isActive('heading', { level: 3 }) ? 'h3' : 'p';
  const family = FONTS.find((f) => f.css === textStyle.fontFamily)?.family ?? '';
  const size = parseInt(textStyle.fontSize ?? '', 10) || '';
  const highlightColor = editor.getAttributes('highlight').color as string | undefined;

  return (
    <div className="ed-toolbar" role="toolbar" aria-label="Text formatting" onMouseDown={(e) => { if ((e.target as HTMLElement).tagName !== 'SELECT') keepFocus(e); }}>
      <select aria-label="Paragraph style" value={block} onChange={(e) => {
        const v = e.target.value;
        if (v === 'p') chain().setParagraph().run();
        else chain().setHeading({ level: +v[1] as 1 | 2 | 3 }).run();
      }}>
        <option value="p">Text</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>
      <select aria-label="Font" value={family} onChange={(e) => {
        const css = FONTS.find((f) => f.family === e.target.value)?.css;
        if (css) chain().setFontFamily(css).run();
        else chain().unsetFontFamily().run();
      }}>
        <option value="">Default font</option>
        {FONTS.map((f) => <option key={f.family} value={f.family}>{f.family}</option>)}
      </select>
      <select aria-label="Text size" className="ed-size" value={size} onChange={(e) => {
        if (e.target.value) chain().setFontSize(`${e.target.value}px`).run();
        else chain().unsetFontSize().run();
      }}>
        <option value="">Size</option>
        {FONT_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <span className="ed-sep" />
      <IconButton size={19} icon="bold" label="Bold" active={editor.isActive('bold')} onClick={() => chain().toggleBold().run()} />
      <IconButton size={19} icon="italic" label="Italic" active={editor.isActive('italic')} onClick={() => chain().toggleItalic().run()} />
      <IconButton size={19} icon="underline" label="Underline" active={editor.isActive('underline')} onClick={() => chain().toggleUnderline().run()} />
      <IconButton size={19} icon="strike" label="Strikethrough" active={editor.isActive('strike')} onClick={() => chain().toggleStrike().run()} />
      <span className="ed-sep" />
      <IconButton size={19} icon="bullets" label="Bulleted list" active={editor.isActive('bulletList')} onClick={() => chain().toggleBulletList().run()} />
      <IconButton size={19} icon="numbers" label="Numbered list" active={editor.isActive('orderedList')} onClick={() => chain().toggleOrderedList().run()} />
      <IconButton size={19} icon="checklist" label="Checkboxes" active={editor.isActive('taskList')} onClick={() => chain().toggleTaskList().run()} />
      <span className="ed-sep" />
      <IconButton size={19} icon="alignLeft" label="Align left" active={editor.isActive({ textAlign: 'left' })} onClick={() => chain().setTextAlign('left').run()} />
      <IconButton size={19} icon="alignCenter" label="Align center" active={editor.isActive({ textAlign: 'center' })} onClick={() => chain().setTextAlign('center').run()} />
      <IconButton size={19} icon="alignRight" label="Align right" active={editor.isActive({ textAlign: 'right' })} onClick={() => chain().setTextAlign('right').run()} />
      <span className="ed-sep" />
      <div className="ed-swatches" role="group" aria-label="Text color">
        <button type="button" className={`swatch swatch-ink ${!textStyle.color ? 'is-active' : ''}`} aria-label="Default text color" onClick={() => chain().unsetColor().run()} />
        {TEXT_COLORS.map((c) => (
          <button key={c.value} type="button" className={`swatch ${textStyle.color === c.value ? 'is-active' : ''}`} style={{ background: c.value }} aria-label={`${c.name} text`} onClick={() => chain().setColor(c.value).run()} />
        ))}
      </div>
      <span className="ed-sep" />
      <div className="ed-swatches" role="group" aria-label="Text highlight">
        {TEXT_HIGHLIGHTS.map((c) => (
          <button key={c.value} type="button" className={`swatch swatch-hl ${highlightColor === c.value ? 'is-active' : ''}`} style={{ background: c.value }} aria-label={`${c.name} highlight`} onClick={() => chain().toggleHighlight({ color: c.value }).run()} />
        ))}
      </div>
    </div>
  );
}
