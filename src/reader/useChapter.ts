import { useEffect, useState } from 'react';
import { loadChapter, type ChapterData } from '../bible/data.ts';

export function useChapter(translation: string, book: string, chapter: number) {
  const [state, setState] = useState<{ key: string; data?: ChapterData; error?: string }>({ key: '' });
  const key = `${translation}/${book}/${chapter}`;
  useEffect(() => {
    let live = true;
    loadChapter(translation, book, chapter).then(
      (data) => live && setState({ key, data }),
      (e: Error) => live && setState({ key, error: e.message }),
    );
    return () => { live = false; };
  }, [key, translation, book, chapter]);
  return state.key === key ? state : { key, data: undefined, error: undefined };
}
