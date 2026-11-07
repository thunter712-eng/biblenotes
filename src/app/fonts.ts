// Self-hosted so every face works offline. Only the Latin subsets are bundled, which keeps the precache small.
import '@fontsource/alegreya-sans/latin-400.css';
import '@fontsource/alegreya-sans/latin-500.css';
import '@fontsource/alegreya-sans/latin-700.css';
import '@fontsource/eb-garamond/latin-400.css';
import '@fontsource/eb-garamond/latin-400-italic.css';
import '@fontsource/eb-garamond/latin-600.css';
import '@fontsource/lora/latin-400.css';
import '@fontsource/lora/latin-700.css';
import '@fontsource/lora/latin-400-italic.css';
import '@fontsource/merriweather/latin-400.css';
import '@fontsource/merriweather/latin-700.css';
import '@fontsource/source-serif-4/latin-400.css';
import '@fontsource/source-serif-4/latin-700.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/caveat/latin-400.css';
import '@fontsource/caveat/latin-700.css';
import '@fontsource/patrick-hand/latin-400.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-700.css';

export interface FontOption {
  family: string;
  css: string;
  kind: 'Serif' | 'Sans' | 'Handwriting' | 'Mono';
}

export const FONTS: FontOption[] = [
  { family: 'EB Garamond', css: "'EB Garamond', Georgia, serif", kind: 'Serif' },
  { family: 'Lora', css: "'Lora', Georgia, serif", kind: 'Serif' },
  { family: 'Merriweather', css: "'Merriweather', Georgia, serif", kind: 'Serif' },
  { family: 'Source Serif 4', css: "'Source Serif 4', Georgia, serif", kind: 'Serif' },
  { family: 'Inter', css: "'Inter', system-ui, sans-serif", kind: 'Sans' },
  { family: 'Alegreya Sans', css: "'Alegreya Sans', system-ui, sans-serif", kind: 'Sans' },
  { family: 'Caveat', css: "'Caveat', cursive", kind: 'Handwriting' },
  { family: 'Patrick Hand', css: "'Patrick Hand', cursive", kind: 'Handwriting' },
  { family: 'JetBrains Mono', css: "'JetBrains Mono', ui-monospace, monospace", kind: 'Mono' },
];

export const fontCss = (family: string): string => FONTS.find((f) => f.family === family)?.css ?? `'${family}', serif`;
