import { create } from 'zustand';
import { db } from '../db/schema.ts';

export type Theme = 'light' | 'sepia' | 'dark';

export interface Settings {
  theme: Theme;
  translation: string;
  parallelTranslation: string;
  parallel: boolean;
  readerFont: string;
  readerSize: number;
  readerLeading: number;
  fingerDraws: boolean;
  /** Days between backup reminders. */
  backupReminderDays: number;
  splitRatio: number;
  showVerseNumbers: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'light',
  translation: 'web',
  parallelTranslation: 'asv',
  parallel: false,
  readerFont: 'EB Garamond',
  readerSize: 21,
  readerLeading: 1.55,
  fingerDraws: false,
  backupReminderDays: 14,
  splitRatio: 0.48,
  showVerseNumbers: true,
};

interface SettingsStore extends Settings {
  loaded: boolean;
  load: () => Promise<void>;
  set: (patch: Partial<Settings>) => void;
}

const THEME_COLORS: Record<Theme, string> = { light: '#FAFAF7', sepia: '#F1E4CB', dark: '#14171F' };

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
}

export const useSettings = create<SettingsStore>((set, get) => ({
  ...DEFAULT_SETTINGS,
  loaded: false,
  load: async () => {
    const row = await db.kv.get('settings');
    const merged = { ...DEFAULT_SETTINGS, ...(row?.value as Partial<Settings> | undefined) };
    applyTheme(merged.theme);
    set({ ...merged, loaded: true });
  },
  set: (patch) => {
    set(patch);
    if (patch.theme) applyTheme(patch.theme);
    const { loaded: _l, load: _a, set: _s, ...values } = get();
    void db.kv.put({ key: 'settings', value: values });
  },
}));
