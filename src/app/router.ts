import { useSyncExternalStore } from 'react';

export type Route =
  | { name: 'read'; book: string; chapter: number; verse?: number; pageId?: string; noteId?: string }
  | { name: 'notes' }
  | { name: 'notebooks' }
  | { name: 'search'; query?: string }
  | { name: 'settings' }
  | { name: 'about' }
  | { name: 'ink-test' };

export function parseHash(hash: string): Route | null {
  const [path, qs] = hash.replace(/^#\/?/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  const q = new URLSearchParams(qs ?? '');
  switch (parts[0]) {
    case 'read': {
      const chapter = parseInt(parts[2] ?? '1', 10);
      if (!parts[1] || !chapter) return null;
      const verse = q.get('v');
      return {
        name: 'read',
        book: parts[1],
        chapter,
        ...(verse ? { verse: +verse } : {}),
        ...(q.get('page') ? { pageId: q.get('page')! } : {}),
        ...(q.get('note') ? { noteId: q.get('note')! } : {}),
      };
    }
    case 'notes': return { name: 'notes' };
    case 'notebooks': return { name: 'notebooks' };
    case 'search': return { name: 'search', query: q.get('q') ?? undefined };
    case 'settings': return { name: 'settings' };
    case 'about': return { name: 'about' };
    case 'ink-test': return { name: 'ink-test' };
    default: return null;
  }
}

export function routeToHash(r: Route): string {
  switch (r.name) {
    case 'read': {
      const q = new URLSearchParams();
      if (r.verse) q.set('v', `${r.verse}`);
      if (r.pageId) q.set('page', r.pageId);
      if (r.noteId) q.set('note', r.noteId);
      const s = q.toString();
      return `#/read/${r.book}/${r.chapter}${s ? `?${s}` : ''}`;
    }
    case 'search': return r.query ? `#/search?q=${encodeURIComponent(r.query)}` : '#/search';
    default: return `#/${r.name}`;
  }
}

export function navigate(r: Route, replace = false) {
  const hash = routeToHash(r);
  if (replace) {
    history.replaceState(null, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = hash;
  }
}

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

export function useHash(): string {
  return useSyncExternalStore(subscribe, () => location.hash);
}
