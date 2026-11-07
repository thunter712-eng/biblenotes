import { useEffect, useState } from 'react';
import { loadTranslations, type TranslationInfo } from '../bible/data.ts';
import { FONTS } from '../app/fonts.ts';
import { useSettings, type Theme } from '../app/settings.ts';
import { Field, Segmented, Sheet } from '../ui/primitives.tsx';

export function useTranslations(): TranslationInfo[] {
  const [list, setList] = useState<TranslationInfo[]>([]);
  useEffect(() => { void loadTranslations().then(setList); }, []);
  return list;
}

export function ReadingSettings({ onClose }: { onClose: () => void }) {
  const s = useSettings();
  const translations = useTranslations();
  return (
    <Sheet title="Reading" onClose={onClose} width={440}>
      <div className="form-stack">
        <Field label="Theme">
          <Segmented<Theme> label="Theme" value={s.theme} onChange={(theme) => s.set({ theme })} options={[{ value: 'light', label: 'Light' }, { value: 'sepia', label: 'Sepia' }, { value: 'dark', label: 'Dark' }]} />
        </Field>
        <Field label="Translation">
          <select value={s.translation} onChange={(e) => s.set({ translation: e.target.value })}>
            {translations.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.abbr})</option>)}
          </select>
        </Field>
        <label className="check-row">
          <input type="checkbox" checked={s.parallel} onChange={(e) => s.set({ parallel: e.target.checked })} />
          <span>Show a second translation side by side</span>
        </label>
        {s.parallel && (
          <Field label="Second translation">
            <select value={s.parallelTranslation} onChange={(e) => s.set({ parallelTranslation: e.target.value })}>
              {translations.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.abbr})</option>)}
            </select>
          </Field>
        )}
        <Field label="Font">
          <select value={s.readerFont} onChange={(e) => s.set({ readerFont: e.target.value })}>
            {FONTS.filter((f) => f.kind !== 'Mono').map((f) => <option key={f.family} value={f.family}>{f.family}</option>)}
          </select>
        </Field>
        <Field label={`Text size: ${s.readerSize}`}>
          <input type="range" min={14} max={36} step={1} value={s.readerSize} onChange={(e) => s.set({ readerSize: +e.target.value })} />
        </Field>
        <Field label={`Line spacing: ${s.readerLeading.toFixed(2)}`}>
          <input type="range" min={1.2} max={2.2} step={0.05} value={s.readerLeading} onChange={(e) => s.set({ readerLeading: +e.target.value })} />
        </Field>
        <label className="check-row">
          <input type="checkbox" checked={s.showVerseNumbers} onChange={(e) => s.set({ showVerseNumbers: e.target.checked })} />
          <span>Show verse numbers</span>
        </label>
      </div>
    </Sheet>
  );
}
