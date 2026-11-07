import { PageShell } from './PageShell.tsx';
import { useTranslations } from '../reader/ReadingSettings.tsx';

export function AboutPage() {
  const translations = useTranslations();
  return (
    <PageShell title="About Bible Notes">
      <div className="prose">
        <p>A free study Bible for iPad. Everything you write stays on this device, and nothing is sent anywhere.</p>
        <h2>Translations</h2>
        {translations.map((t) => (
          <section key={t.id} className="license">
            <h3>{t.name} ({t.abbr}), {t.year}</h3>
            <p><strong>{t.license}.</strong> {t.attribution}</p>
            <p className="muted">License statement: <a href={t.licenseUrl}>{t.licenseUrl}</a><br />Source text: <a href={t.sourceUrl}>{t.sourceUrl}</a></p>
          </section>
        ))}
        <h2>Fonts and software</h2>
        <p>Fonts are self-hosted under the SIL Open Font License: EB Garamond, Lora, Merriweather, Source Serif 4, Inter, Alegreya Sans, Caveat, Patrick Hand and JetBrains Mono.</p>
        <p>Built with React, Tiptap and ProseMirror, Zustand, perfect-freehand and fflate (all MIT), and Dexie (Apache-2.0).</p>
      </div>
    </PageShell>
  );
}
