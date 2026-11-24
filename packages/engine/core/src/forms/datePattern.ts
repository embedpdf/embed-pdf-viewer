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

/** What a date group writes: the year, the month or the day. */
type DatePart = 'year' | 'month' | 'day';

/** How a part of a pattern is written: in digits, in letters, or as a separator. */
type Written = 'digits' | 'letters' | 'separator';

/** The groups a date is written in: what each writes, and whether as a number or by name. */
const DATE_GROUPS: ReadonlyMap<string, { part: DatePart; written: Written }> = new Map([
  ['yyyy', { part: 'year', written: 'digits' }],
  ['yy', { part: 'year', written: 'digits' }],
  ['mmmm', { part: 'month', written: 'letters' }],
  ['mmm', { part: 'month', written: 'letters' }],
  ['mm', { part: 'month', written: 'digits' }],
  ['m', { part: 'month', written: 'digits' }],
  ['dd', { part: 'day', written: 'digits' }],
  ['d', { part: 'day', written: 'digits' }],
]);
/** What stands between groups. A colon is not among them: it belongs to a time. */
const SEPARATORS = ' /-.,';
/**
 * A time, in the one shape it is read back in: hours, minutes after a colon,
 * seconds after another, and `tt` after it, with or without spaces.
 */
const TIME = /(?:HH|H|hh|h):MM(?::ss)?(?: *tt)?/;
const LONGEST_PATTERN = 64;

/** A stretch of a pattern outside its time. */
interface Stretch {
  /** How each of its parts is written, in order. */
  readonly written: Written[];
  /** What each of its date groups writes, in order. */
  readonly groups: DatePart[];
}

/**
 * A stretch of a pattern outside its time, read: `null` when it holds
 * anything a pattern isn't made of: another letter, a letter group cut short
 * or run on (`yyy`, `dddd`), a time's letter, a colon.
 */
function stretchOf(text: string): Stretch | null {
  const stretch: Stretch = { written: [], groups: [] };
  // A run of one letter, or any single character that is no letter.
  for (const run of text.match(/([A-Za-z])\1*|[^A-Za-z]/g) ?? []) {
    const group = DATE_GROUPS.get(run);
    if (group) {
      stretch.written.push(group.written);
      stretch.groups.push(group.part);
    } else if (SEPARATORS.includes(run)) {
      stretch.written.push('separator');
    } else {
      return null;
    }
  }
  return stretch;
}

/**
 * Whether `pattern` is one a date format is written with: a pattern the
 * script runtime writes a date by, and reads its own writing back by. It is
 * 1 to 64 characters, made of:
 *
 * - the date groups `yyyy yy mmmm mmm mm m dd d`, at least one of them, with
 *   the year, the month and the day each written once at most;
 * - at most one time, written with colons: `HH`, `H`, `hh` or `h`, then
 *   `:MM`, then `:ss` when it has seconds, then `tt` when it has one;
 * - spaces and `/ - . ,` between them.
 *
 * A run of one letter is one group, whole: `yyy` and `dddd` are no pattern.
 * Two groups written in digits never touch, since their digits would read
 * as one number: `yyyymmdd` is no pattern, and neither is a day right before
 * a time. A part written twice is none either (`yyyy/mm/mm/dd`, `mmm mm`):
 * read back, the second takes the next part's number. A time in another
 * shape (`HH.MM`, `H:M`, minutes alone, `tt` before it) is none: the runtime
 * prints it and can't read it back, and a field that refuses what it shows,
 * or reads another date from it, is a broken field. A time on its own is a
 * time's pattern ({@link isTimePattern}), not a date's.
 */
export function isDatePattern(pattern: unknown): pattern is string {
  if (typeof pattern !== 'string') return false;
  if (pattern.length < 1 || pattern.length > LONGEST_PATTERN) return false;
  const time = TIME.exec(pattern);
  const before = stretchOf(time ? pattern.slice(0, time.index) : pattern);
  const after = stretchOf(time ? pattern.slice(time.index + time[0].length) : '');
  if (!before || !after) return false;
  const groups = [...before.groups, ...after.groups];
  if (groups.length === 0 || new Set(groups).size !== groups.length) return false;
  // A time starts in digits, and ends in them unless `tt` closes it.
  const timeWritten: Written[] = time
    ? ['digits', time[0].endsWith('tt') ? 'letters' : 'digits']
    : [];
  const written = [...before.written, ...timeWritten, ...after.written];
  // The time's own two ends are one time, not two groups that touch.
  const touching = written.some(
    (part, at) => part === 'digits' && written[at + 1] === 'digits' && at !== before.written.length,
  );
  return !touching;
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
