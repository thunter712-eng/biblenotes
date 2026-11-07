export type BookGroup = 'Law' | 'History' | 'Wisdom' | 'Prophets' | 'Gospels and Acts' | 'Letters' | 'Revelation';

export interface BookInfo {
  id: string;
  name: string;
  /** Short name for picker tabs. */
  abbr: string;
  chapters: number;
  group: BookGroup;
  /** Lowercase names accepted by the reference parser, beyond the full name and abbr. */
  aliases: string[];
}

const b = (id: string, name: string, abbr: string, chapters: number, group: BookGroup, ...aliases: string[]): BookInfo => ({ id, name, abbr, chapters, group, aliases });

export const BOOKS: BookInfo[] = [
  b('GEN', 'Genesis', 'Gen', 50, 'Law', 'ge', 'gn'),
  b('EXO', 'Exodus', 'Exo', 40, 'Law', 'ex', 'exod'),
  b('LEV', 'Leviticus', 'Lev', 27, 'Law', 'lv'),
  b('NUM', 'Numbers', 'Num', 36, 'Law', 'nu', 'nm'),
  b('DEU', 'Deuteronomy', 'Deu', 34, 'Law', 'dt', 'deut'),
  b('JOS', 'Joshua', 'Jos', 24, 'History', 'josh'),
  b('JDG', 'Judges', 'Jdg', 21, 'History', 'judg', 'jg'),
  b('RUT', 'Ruth', 'Rut', 4, 'History', 'ru', 'rth'),
  b('1SA', '1 Samuel', '1Sa', 31, 'History', '1 sam', '1sam', '1 sa'),
  b('2SA', '2 Samuel', '2Sa', 24, 'History', '2 sam', '2sam', '2 sa'),
  b('1KI', '1 Kings', '1Ki', 22, 'History', '1 kgs', '1kgs', '1 ki', '1 kin'),
  b('2KI', '2 Kings', '2Ki', 25, 'History', '2 kgs', '2kgs', '2 ki', '2 kin'),
  b('1CH', '1 Chronicles', '1Ch', 29, 'History', '1 chr', '1chr', '1 ch', '1 chron'),
  b('2CH', '2 Chronicles', '2Ch', 36, 'History', '2 chr', '2chr', '2 ch', '2 chron'),
  b('EZR', 'Ezra', 'Ezr', 10, 'History'),
  b('NEH', 'Nehemiah', 'Neh', 13, 'History', 'ne'),
  b('EST', 'Esther', 'Est', 10, 'History', 'esth'),
  b('JOB', 'Job', 'Job', 42, 'Wisdom', 'jb'),
  b('PSA', 'Psalms', 'Psa', 150, 'Wisdom', 'ps', 'psalm', 'pss', 'psm'),
  b('PRO', 'Proverbs', 'Pro', 31, 'Wisdom', 'pr', 'prov', 'prv'),
  b('ECC', 'Ecclesiastes', 'Ecc', 12, 'Wisdom', 'ec', 'eccl', 'qoh'),
  b('SNG', 'Song of Solomon', 'Sng', 8, 'Wisdom', 'song', 'song of songs', 'sos', 'ss', 'canticles'),
  b('ISA', 'Isaiah', 'Isa', 66, 'Prophets', 'is'),
  b('JER', 'Jeremiah', 'Jer', 52, 'Prophets', 'je', 'jr'),
  b('LAM', 'Lamentations', 'Lam', 5, 'Prophets', 'la'),
  b('EZK', 'Ezekiel', 'Ezk', 48, 'Prophets', 'eze', 'ezek'),
  b('DAN', 'Daniel', 'Dan', 12, 'Prophets', 'da', 'dn'),
  b('HOS', 'Hosea', 'Hos', 14, 'Prophets', 'ho'),
  b('JOL', 'Joel', 'Jol', 3, 'Prophets', 'joe', 'jl'),
  b('AMO', 'Amos', 'Amo', 9, 'Prophets', 'am'),
  b('OBA', 'Obadiah', 'Oba', 1, 'Prophets', 'ob', 'obad'),
  b('JON', 'Jonah', 'Jon', 4, 'Prophets', 'jnh'),
  b('MIC', 'Micah', 'Mic', 7, 'Prophets', 'mi'),
  b('NAM', 'Nahum', 'Nam', 3, 'Prophets', 'na', 'nah'),
  b('HAB', 'Habakkuk', 'Hab', 3, 'Prophets'),
  b('ZEP', 'Zephaniah', 'Zep', 3, 'Prophets', 'zeph', 'zp'),
  b('HAG', 'Haggai', 'Hag', 2, 'Prophets', 'hg'),
  b('ZEC', 'Zechariah', 'Zec', 14, 'Prophets', 'zech', 'zc'),
  b('MAL', 'Malachi', 'Mal', 4, 'Prophets', 'ml'),
  b('MAT', 'Matthew', 'Mat', 28, 'Gospels and Acts', 'mt', 'matt'),
  b('MRK', 'Mark', 'Mrk', 16, 'Gospels and Acts', 'mk', 'mr', 'mar'),
  b('LUK', 'Luke', 'Luk', 24, 'Gospels and Acts', 'lk', 'lu'),
  b('JHN', 'John', 'Jhn', 21, 'Gospels and Acts', 'jn', 'joh'),
  b('ACT', 'Acts', 'Act', 28, 'Gospels and Acts', 'ac', 'acts of the apostles'),
  b('ROM', 'Romans', 'Rom', 16, 'Letters', 'ro', 'rm'),
  b('1CO', '1 Corinthians', '1Co', 16, 'Letters', '1 cor', '1cor', '1 co'),
  b('2CO', '2 Corinthians', '2Co', 13, 'Letters', '2 cor', '2cor', '2 co'),
  b('GAL', 'Galatians', 'Gal', 6, 'Letters', 'ga'),
  b('EPH', 'Ephesians', 'Eph', 6, 'Letters', 'ephes'),
  b('PHP', 'Philippians', 'Php', 4, 'Letters', 'phil', 'pp'),
  b('COL', 'Colossians', 'Col', 4, 'Letters'),
  b('1TH', '1 Thessalonians', '1Th', 5, 'Letters', '1 thess', '1thess', '1 th'),
  b('2TH', '2 Thessalonians', '2Th', 3, 'Letters', '2 thess', '2thess', '2 th'),
  b('1TI', '1 Timothy', '1Ti', 6, 'Letters', '1 tim', '1tim', '1 ti'),
  b('2TI', '2 Timothy', '2Ti', 4, 'Letters', '2 tim', '2tim', '2 ti'),
  b('TIT', 'Titus', 'Tit', 3, 'Letters'),
  b('PHM', 'Philemon', 'Phm', 1, 'Letters', 'philem', 'phlm'),
  b('HEB', 'Hebrews', 'Heb', 13, 'Letters'),
  b('JAS', 'James', 'Jas', 5, 'Letters', 'jam', 'jm'),
  b('1PE', '1 Peter', '1Pe', 5, 'Letters', '1 pet', '1pet', '1 pe', '1 pt'),
  b('2PE', '2 Peter', '2Pe', 3, 'Letters', '2 pet', '2pet', '2 pe', '2 pt'),
  b('1JN', '1 John', '1Jn', 5, 'Letters', '1 jn', '1 joh', '1john'),
  b('2JN', '2 John', '2Jn', 1, 'Letters', '2 jn', '2 joh', '2john'),
  b('3JN', '3 John', '3Jn', 1, 'Letters', '3 jn', '3 joh', '3john'),
  b('JUD', 'Jude', 'Jud', 1, 'Letters', 'jd'),
  b('REV', 'Revelation', 'Rev', 22, 'Revelation', 're', 'rv', 'apocalypse', 'revelations'),
];

export const BOOK_GROUPS: BookGroup[] = ['Law', 'History', 'Wisdom', 'Prophets', 'Gospels and Acts', 'Letters', 'Revelation'];

const byId = new Map(BOOKS.map((x, i) => [x.id, { info: x, index: i }]));

export const getBook = (id: string): BookInfo | undefined => byId.get(id)?.info;
export const bookIndex = (id: string): number => byId.get(id)?.index ?? -1;

const aliasMap = new Map<string, string>();
for (const x of BOOKS) {
  for (const key of [x.name.toLowerCase(), x.abbr.toLowerCase(), x.id.toLowerCase(), ...x.aliases]) aliasMap.set(key, x.id);
  // "I John", "II Kings" and "1st Peter" spellings.
  const m = /^([123]) (.+)$/.exec(x.name.toLowerCase());
  if (m) {
    const roman = ['i', 'ii', 'iii'][+m[1] - 1];
    const ord = ['1st', '2nd', '3rd'][+m[1] - 1];
    aliasMap.set(`${roman} ${m[2]}`, x.id);
    aliasMap.set(`${ord} ${m[2]}`, x.id);
    aliasMap.set(`${m[1]}${m[2]}`, x.id);
  }
}

/** Finds a book by exact alias, then by unambiguous name prefix. */
export function findBook(text: string): BookInfo | undefined {
  const q = text.trim().toLowerCase().replace(/\.$/, '').replace(/\s+/g, ' ');
  if (!q) return undefined;
  const exact = aliasMap.get(q);
  if (exact) return getBook(exact);
  const matches = BOOKS.filter((x) => x.name.toLowerCase().startsWith(q));
  return matches.length === 1 ? matches[0] : undefined;
}
