import { useEffect, useState } from 'react';
import { navigate, parseHash, useHash, type Route } from './app/router.ts';
import { db } from './db/schema.ts';
import { AboutPage } from './app/AboutPage.tsx';
import { SearchPage } from './reader/SearchPage.tsx';
import { StudyView } from './reader/StudyView.tsx';
import { InkTestPage } from './ink/InkTestPage.tsx';
import { Toasts } from './ui/primitives.tsx';
import { NotesIndexPage } from './library/NotesIndexPage.tsx';
import { NotebooksPage } from './library/NotebooksPage.tsx';
import { SettingsPage } from './app/SettingsPage.tsx';
import { AppNotices } from './app/AppNotices.tsx';

function renderRoute(route: Route) {
  switch (route.name) {
    case 'read': return <StudyView route={route} />;
    case 'search': return <SearchPage key={route.query ?? ''} initialQuery={route.query} />;
    case 'about': return <AboutPage />;
    case 'ink-test': return <InkTestPage />;
    case 'notes': return <NotesIndexPage />;
    case 'notebooks': return <NotebooksPage />;
    case 'settings': return <SettingsPage />;
  }
}

export function App() {
  const hash = useHash();
  const route = parseHash(hash);
  const [ready, setReady] = useState(!!route);

  useEffect(() => {
    if (route) { setReady(true); return; }
    void db.kv.get('lastPosition').then((row) => {
      const pos = row?.value as { book: string; chapter: number; at?: number } | undefined;
      navigate(pos ? { name: 'read', ...pos } : { name: 'read', book: 'JHN', chapter: 1 }, true);
      setReady(true);
    });
  }, [route]);

  if (!ready || !route) return null;
  return (
    <>
      {renderRoute(route)}
      <AppNotices />
      <Toasts />
    </>
  );
}
