import { useEffect, useRef } from 'react';
import { fontCss } from '../app/fonts.ts';
import { useSettings } from '../app/settings.ts';
import { getBook } from '../bible/books.ts';
import { ChapterText, NO_DECOR, ParallelText } from './ChapterText.tsx';
import { useChapter } from './useChapter.ts';

export function ReaderPane({ book, chapter, verse }: { book: string; chapter: number; verse?: number }) {
  const s = useSettings();
  const main = useChapter(s.translation, book, chapter);
  const second = useChapter(s.parallelTranslation, book, chapter);
  const scroller = useRef<HTMLDivElement>(null);
  const info = getBook(book);

  useEffect(() => {
    if (!main.data) return;
    const target = verse ? document.getElementById(`v-${s.translation}-${verse}`) : null;
    if (target) target.scrollIntoView({ block: 'center' });
    else scroller.current?.scrollTo(0, 0);
  }, [main.data, verse, s.translation]);

  const parallel = s.parallel && s.parallelTranslation !== s.translation;
  return (
    <div className="reader-scroll" ref={scroller} data-testid="reader">
      <article className={`reader ${parallel ? 'is-parallel' : ''}`} style={{ fontFamily: fontCss(s.readerFont), fontSize: s.readerSize, lineHeight: s.readerLeading }}>
        <h1 className="book-title">{info?.name} {parallel ? chapter : ''}</h1>
        {main.error && <p className="form-error">{main.error}</p>}
        {main.data && (parallel && second.data ? (
          <ParallelText left={main.data} right={second.data} leftId={s.translation} rightId={s.parallelTranslation} showNumbers={s.showVerseNumbers} decorFor={() => NO_DECOR} />
        ) : (
          <ChapterText data={main.data} chapter={chapter} translation={s.translation} showNumbers={s.showVerseNumbers} decorFor={() => NO_DECOR} />
        ))}
      </article>
    </div>
  );
}
