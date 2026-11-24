import { installAcroJs } from './prelude';
import type { AcroJsVmGlobal } from './types';

/**
 * Dates by a pattern (`dd/mm/yyyy`, `h:MM tt`), without running a script:
 * what a form's date field shows and takes, by the same code its format and
 * keystroke scripts run. The Acrobat object model is installed once into an
 * object of this module's own, and its date code is called there. Nothing is
 * evaluated, and no script ever runs in that object.
 */

/**
 * A calendar date and a time of day, as a form field shows them. It has no
 * time zone: a date in a field is the day its text says.
 */
export interface DateParts {
  year: number;
  /** 1 to 12. */
  month: number;
  /** 1 to 31. */
  day: number;
  /** 0 to 23. */
  hour: number;
  minute: number;
  second: number;
}

/** A date to write: its day, and its time of day when it has one (midnight when left out). */
export type DatePartsInput = Pick<DateParts, 'year' | 'month' | 'day'> &
  Partial<Pick<DateParts, 'hour' | 'minute' | 'second'>>;

/** What this module calls of the object model. */
interface DateModel extends Pick<AcroJsVmGlobal, '__acrojsParseDate'> {
  util: { printd(pattern: string, date: Date): string };
}

let installed: DateModel | undefined;

/** The object model, installed on first use into an object nothing else reaches. */
function dateModel(): DateModel {
  if (!installed) {
    const realm: Record<string, unknown> = {};
    installAcroJs(realm);
    installed = realm as unknown as DateModel;
  }
  return installed;
}

/**
 * `date` as `pattern` shows it: `formatDate({ year: 2026, month: 3, day: 5 },
 * 'dd/mm/yyyy')` is `'05/03/2026'`. It is `util.printd`, so a date written
 * here and one a format script writes are the same text: month names are
 * English, `tt` is `am` or `pm`, and what isn't one of the pattern's letter
 * groups is written as it is.
 */
export function formatDate(date: DatePartsInput, pattern: string): string {
  // With no script running, `util.printd` reads a date's UTC parts as they
  // are, so the parts go there unchanged, whatever zone this machine is in.
  const instant = new Date(0);
  instant.setUTCFullYear(date.year, date.month - 1, date.day);
  instant.setUTCHours(date.hour ?? 0, date.minute ?? 0, date.second ?? 0, 0);
  return dateModel().util.printd(pattern, instant);
}

/**
 * The date `text` says under `pattern`, or `null` when it says none. It
 * reads what the field's keystroke script accepts, and nothing more: the
 * numbers in the text are the year, the month and the day in the order the
 * pattern has them, so `5/3/26` reads under `dd/mm/yyyy`; a month may be its
 * English name; a two-digit year below 50 is in this century; a time is
 * hours and minutes with a colon. A day its month doesn't have is no date.
 *
 * `today` gives the year and the month the text leaves out, and a day left
 * out is the first. It is required: this function reads no clock.
 *
 * A format script goes one step further for text the pattern can't read, to
 * JavaScript's own date parsing, which differs from one engine to the next.
 * This function doesn't: an ISO date under `dd/mm/yyyy` gives `null`.
 */
export function parseDate(
  text: string,
  pattern: string,
  today: Pick<DateParts, 'year' | 'month' | 'day'>,
): DateParts | null {
  return dateModel().__acrojsParseDate(text, pattern, today);
}
