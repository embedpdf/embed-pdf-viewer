/**
 * A moment as the viewer writes it: short where it sits in a row (`Sep 14, 2:30 PM`), and whole
 * where there's room, such as its tooltip (`Monday, September 14, 2026 at 2:30:05 PM`). Both are
 * in the reader's own time zone and in the viewer's format language (`useFormatLocale`).
 */

/** A moment, written two ways in one language. */
export interface TimestampFormat {
  /** The day and the time to the minute, with the year when it isn't `now`'s. */
  short(moment: Date, now?: Date): string;
  /** The whole date, with its weekday, and the time to the second. */
  full(moment: Date): string;
}

const SHORT = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' } as const;

/**
 * Each language's formats, kept: building a formatter costs far more than using one, and a list
 * writes a moment in every row.
 */
const formats = new Map<string | undefined, TimestampFormat>();

/**
 * How a language writes a moment. `locale` is a tag the browser can read, or `undefined` for the
 * browser's own language.
 */
export function timestampFormat(locale: string | undefined): TimestampFormat {
  let format = formats.get(locale);
  if (!format) {
    const thisYear = new Intl.DateTimeFormat(locale, SHORT);
    const otherYear = new Intl.DateTimeFormat(locale, { ...SHORT, year: 'numeric' });
    const whole = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'medium' });
    format = {
      short: (moment, now = new Date()) =>
        (moment.getFullYear() === now.getFullYear() ? thisYear : otherYear).format(moment),
      full: (moment) => whole.format(moment),
    };
    formats.set(locale, format);
  }
  return format;
}

/** The moment a date string names (ISO 8601), or `null` when it names none. */
export function timestampOf(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const moment = new Date(iso);
  return Number.isNaN(moment.getTime()) ? null : moment;
}
