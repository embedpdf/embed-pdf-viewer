/**
 * Date and time patterns, as PDF forms write them: `dd/mm/yyyy`, `h:MM tt`.
 * A date field's format script names one (`AFDate_FormatEx("dd/mm/yyyy")`),
 * and Acrobat's `util.printd` prints by one.
 *
 * What the engine needs of them is here: which strings are a pattern, and
 * the patterns Acrobat's older calls name by number. Writing and reading a
 * date by a pattern is the script runtime's (`@embedpdf/core-acrojs`), whose
 * lists a test there holds equal to these, and whose reading a test there
 * holds this pattern check to.
 */

/** The patterns `AFDate_Format(n)` names by number, in order: Acrobat's own list of date formats. */
export const STANDARD_DATE_PATTERNS: readonly string[] = Object.freeze([
  'm/d',
  'm/d/yy',
  'mm/dd/yy',
  'mm/yy',
  'd-mmm',
  'd-mmm-yy',
  'dd-mmm-yy',
  'yy-mm-dd',
  'mmm-yy',
  'mmmm-yy',
  'mmm d, yyyy',
  'mmmm d, yyyy',
  'm/d/yy h:MM tt',
  'm/d/yy HH:MM',
]);

/** The patterns `AFTime_Format(n)` names by number, in order: Acrobat's own list of time formats. */
export const STANDARD_TIME_PATTERNS: readonly string[] = Object.freeze([
  'HH:MM',
  'h:MM tt',
  'HH:MM:ss',
  'h:MM:ss tt',
]);

/** The groups a date is written in as a number: the year, the month and the day. */
const NUMBER_GROUPS: ReadonlySet<string> = new Set(['yyyy', 'yy', 'mm', 'm', 'dd', 'd']);
/** The groups a month is written in by its name. */
const NAME_GROUPS: ReadonlySet<string> = new Set(['mmmm', 'mmm']);
/** What stands between groups. A colon is not among them: it belongs to a time. */
const SEPARATORS = ' /-.,';
/**
 * A time, in the one shape it is read back in: hours, minutes after a colon,
 * seconds after another, and `tt` after it, with or without spaces.
 */
const TIME = /(?:HH|H|hh|h):MM(?::ss)?(?: *tt)?/;
const LONGEST_PATTERN = 64;

/** What a pattern is made of, by how it is written: in digits, in letters, or a separator. */
type Part = 'digits' | 'letters' | 'separator';

/**
 * The parts of a stretch of a pattern outside its time, in order, or `null`
 * when it holds anything a pattern isn't made of: another letter, a letter
 * group cut short or run on (`yyy`, `dddd`), a time's letter, a colon.
 */
function partsOf(stretch: string): Part[] | null {
  const parts: Part[] = [];
  // A run of one letter, or any single character that is no letter.
  for (const run of stretch.match(/([A-Za-z])\1*|[^A-Za-z]/g) ?? []) {
    if (NUMBER_GROUPS.has(run)) parts.push('digits');
    else if (NAME_GROUPS.has(run)) parts.push('letters');
    else if (SEPARATORS.includes(run)) parts.push('separator');
    else return null;
  }
  return parts;
}

/**
 * Whether `pattern` is one a date format is written with: a pattern the
 * script runtime writes a date by, and reads its own writing back by. It is
 * 1 to 64 characters, made of:
 *
 * - the date groups `yyyy yy mmmm mmm mm m dd d`, at least one of them;
 * - at most one time, written with colons: `HH`, `H`, `hh` or `h`, then
 *   `:MM`, then `:ss` when it has seconds, then `tt` when it has one;
 * - spaces and `/ - . ,` between them.
 *
 * A run of one letter is one group, whole: `yyy` and `dddd` are no pattern.
 * Two groups written in digits never touch, since their digits would read
 * as one number: `yyyymmdd` is no pattern, and neither is a day right before
 * a time. A time in another shape (`HH.MM`, `H:M`, minutes alone, `tt`
 * before it) is none either: the runtime prints it and can't read it back,
 * and a field that refuses what it shows is a broken field. A time on its
 * own is a time's pattern ({@link isTimePattern}), not a date's.
 */
export function isDatePattern(pattern: unknown): pattern is string {
  if (typeof pattern !== 'string') return false;
  if (pattern.length < 1 || pattern.length > LONGEST_PATTERN) return false;
  const time = TIME.exec(pattern);
  const before = partsOf(time ? pattern.slice(0, time.index) : pattern);
  const after = partsOf(time ? pattern.slice(time.index + time[0].length) : '');
  if (!before || !after) return false;
  // A time starts in digits, and ends in them unless `tt` closes it.
  const timeParts: Part[] = time ? ['digits', time[0].endsWith('tt') ? 'letters' : 'digits'] : [];
  const parts = [...before, ...timeParts, ...after];
  // The time's own two ends are one time, not two groups that touch.
  const touching = parts.some(
    (part, at) => part === 'digits' && parts[at + 1] === 'digits' && at !== before.length,
  );
  if (touching) return false;
  return [...before, ...after].some((part) => part !== 'separator');
}

/** A time and nothing else: the whole of a time format's pattern. */
const WHOLE_TIME = new RegExp(`^${TIME.source}$`);

/**
 * Whether `pattern` is one a time format is written with: a time and nothing
 * else, at most 64 characters. `HH`, `H`, `hh` or `h`, then `:MM`, then
 * `:ss` when it has seconds, then `tt` when it has one, with or without
 * spaces before it: `HH:MM`, `h:MM tt`, `hh:MM:sstt`.
 *
 * A time format's keystroke script reads a time and no date
 * (`AFTime_Keystroke`), so a date in its pattern would show text the field
 * then refuses.
 */
export function isTimePattern(pattern: unknown): pattern is string {
  return (
    typeof pattern === 'string' && pattern.length <= LONGEST_PATTERN && WHOLE_TIME.test(pattern)
  );
}
