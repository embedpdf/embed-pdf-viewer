/**
 * PDF dates ↔ the engine's `IsoDateTime`.
 *
 * PDF stores a moment as `D:YYYYMMDDHHmmSSOHH'mm'` (ISO 32000 §7.9.4), where
 * `O` is `+`, `-` or `Z`, and every field after the year may be left out. The
 * engine's data carries ISO 8601 strings instead, and keeps the offset the
 * date was written with, so writing a read value back writes the same moment
 * in the same zone: `D:20170712214438-07'00'` ↔ `2017-07-12T21:44:38-07:00`.
 */
import {
  EngineError,
  EngineErrorCode,
  type DateInput,
  type IsoDateTime,
} from '@embedpdf/engine-core/runtime';

/**
 * A PDF date as ISO 8601, keeping its offset: zero reads as `Z`, and a date
 * without an offset reads without one. Fields the date leaves out take the
 * spec's defaults (month and day 1, the rest 0). The `D:` prefix and the
 * apostrophes of the offset are optional, as readers in the wild treat them.
 * Returns `null` when the text isn't a date.
 */
export function pdfDateToIso(pdf: string): IsoDateTime | null {
  const match =
    /^(?:D:)?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(?:([Zz])(?:00'?00'?)?|([+-])(\d{2})(?:'?(\d{2})'?)?)?$/.exec(
      pdf.trim(),
    );
  if (!match) return null;
  const [, year, month = '01', day = '01', hour = '00', minute = '00', second = '00'] = match;
  const [, , , , , , , zulu, sign, offsetHours, offsetMinutes = '00'] = match;
  const fields = { year, month, day, hour, minute, second };
  if (!validClock(fields)) return null;

  let offset = '';
  if (zulu) {
    offset = 'Z';
  } else if (sign) {
    if (Number(offsetHours) > 23 || Number(offsetMinutes) > 59) return null;
    offset =
      Number(offsetHours) === 0 && Number(offsetMinutes) === 0
        ? 'Z'
        : `${sign}${offsetHours}:${offsetMinutes}`;
  }
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${offset}`;
}

/**
 * A moment as a PDF date. A string keeps its own offset (none if it has
 * none); a `Date` is an instant, written in UTC. A fraction of a second is
 * dropped: PDF dates have whole seconds. UTC is written as `+00'00'` rather
 * than `Z`, which some readers don't accept.
 */
export function formatPdfDate(value: DateInput = new Date()): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new RangeError('Cannot format an invalid Date');
    const iso = value.toISOString();
    return formatPdfDate(`${iso.slice(0, 19)}Z`);
  }
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:([Zz])|([+-])(\d{2}):(\d{2}))?$/.exec(
      value,
    );
  const fields = match && {
    year: match[1]!,
    month: match[2]!,
    day: match[3]!,
    hour: match[4]!,
    minute: match[5]!,
    second: match[6] ?? '00',
  };
  if (!match || !fields || !validClock(fields)) {
    throw new EngineError(EngineErrorCode.InvalidArg, `not an ISO 8601 date and time: '${value}'`);
  }
  const [, , , , , , , zulu, sign, offsetHours, offsetMinutes] = match;
  const offset = zulu ? "+00'00'" : sign ? `${sign}${offsetHours}'${offsetMinutes}'` : '';
  const { year, month, day, hour, minute, second } = fields;
  return `D:${year}${month}${day}${hour}${minute}${second}${offset}`;
}

interface ClockFields {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
}

/** Whether the fields name a real date and time (no February 31, no hour 25). */
function validClock({ year, month, day, hour, minute, second }: ClockFields): boolean {
  const y = Number(year);
  const mo = Number(month);
  const d = Number(day);
  if (mo < 1 || mo > 12 || d < 1) return false;
  const daysInMonth = new Date(Date.UTC(2000, mo, 0)).getUTCDate();
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  if (d > (mo === 2 && !leap ? 28 : daysInMonth)) return false;
  return Number(hour) <= 23 && Number(minute) <= 59 && Number(second) <= 59;
}
