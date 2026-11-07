// To add a public-domain translation: verify its license, add an entry here, run `npm run build:bible`.
// The app discovers translations from the generated public/bible/index.json, so no app code changes.
export interface TranslationSource {
  id: string;
  abbr: string;
  name: string;
  year: string;
  /** eBible.org USFM zip. */
  url: string;
  /** Where the license statement was verified. */
  licenseUrl: string;
  license: string;
  attribution: string;
}

export const TRANSLATIONS: TranslationSource[] = [
  {
    id: 'web',
    abbr: 'WEB',
    name: 'World English Bible',
    year: '2020 stable text',
    url: 'https://ebible.org/Scriptures/engwebp_usfm.zip',
    licenseUrl: 'https://ebible.org/engwebp/copyright.htm',
    license: 'Public Domain',
    attribution:
      'The World English Bible is in the public domain. It is not copyrighted. "World English Bible" is a trademark of eBible.org. This app shows the words unchanged, without the footnotes, cross references, Strong\'s numbers and words-of-Jesus markup found in the source files. Master copy: eBible.org/web and WorldEnglish.Bible.',
  },
  {
    id: 'asv',
    abbr: 'ASV',
    name: 'American Standard Version',
    year: '1901',
    url: 'https://ebible.org/Scriptures/eng-asv_usfm.zip',
    licenseUrl: 'https://ebible.org/eng-asv/copyright.htm',
    license: 'Public Domain',
    attribution:
      'The American Standard Version of the Holy Bible, first published in 1901, is in the public domain. Source files courtesy of eBible.org. This app shows the words unchanged, without the footnotes, Strong\'s numbers and italics for supplied words found in the source files.',
  },
];
