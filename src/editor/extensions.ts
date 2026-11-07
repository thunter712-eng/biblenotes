import StarterKit from '@tiptap/starter-kit';
import { Highlight } from '@tiptap/extension-highlight';
import { TaskItem } from '@tiptap/extension-task-item';
import { TaskList } from '@tiptap/extension-task-list';
import { TextAlign } from '@tiptap/extension-text-align';
import { Color, FontFamily, FontSize, TextStyle } from '@tiptap/extension-text-style';

export const editorExtensions = [
  StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false, codeBlock: false, horizontalRule: false }),
  TextStyle,
  Color,
  FontFamily,
  FontSize,
  Highlight.configure({ multicolor: true }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  TaskList,
  TaskItem.configure({ nested: true }),
];

export const TEXT_COLORS = [
  { name: 'Lapis', value: '#2F55B5' },
  { name: 'Red', value: '#B3261E' },
  { name: 'Green', value: '#2E7D32' },
  { name: 'Purple', value: '#6E3FB5' },
  { name: 'Orange', value: '#C25E12' },
];

// Stored as CSS variables so that highlighted text stays readable when the theme changes.
export const TEXT_HIGHLIGHTS = [
  { name: 'Yellow', value: 'var(--hl-yellow)' },
  { name: 'Green', value: 'var(--hl-green)' },
  { name: 'Blue', value: 'var(--hl-blue)' },
  { name: 'Pink', value: 'var(--hl-pink)' },
  { name: 'Orange', value: 'var(--hl-orange)' },
  { name: 'Purple', value: 'var(--hl-purple)' },
];

export const FONT_SIZES = [14, 16, 18, 20, 24, 28, 36, 48];
