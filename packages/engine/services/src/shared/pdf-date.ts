/**
 * PDF date string format conversion utilities.
 *
 * PDF stores timestamps as ASCII strings shaped like
 * `D:YYYYMMDDHHmmSSOHH'mm'`, where `O` is `+` / `-` / `Z` (Z means
 * UTC and omits the offset). See ISO 32000 §7.9.4.
 *
 * The wire format used by the engine DTOs is always ISO 8601;
 * readers convert PDF → ISO via {@link pdfDateToIso}, writers convert
 * the other way via {@link formatPdfDate}.
 */

/**
 * Parse a PDF date string `D:YYYYMMDDHHmmSSOHH'mm'` to an ISO 8601
 * string. Returns null if the input is malformed.
 *
 * When the timezone is omitted, PDF defines the relationship to UTC as
 * unknown. Since the engine DTO wire format requires an absolute ISO 8601
 * timestamp, this converter retains the pre-existing fallback of treating
 * an omitted timezone as UTC.
 */
export function pdfDateToIso(pdf: string): string | null {
  const match =
    /^D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:(Z)|([+-])(\d{2})'(\d{2})')?$/.exec(pdf);
  if (!match) return null;

  const [, yText, moText, dText, HText, MText, SText, , sign, tzHText, tzMText] = match;
  const y = Number(yText);
  const mo = Number(moText) - 1;
  const d = Number(dText);
  const H = Number(HText);
  const M = Number(MText);
  const S = Number(SText);

  // Construct the local wall-clock fields in UTC space. setUTCFullYear is
  // intentional: Date.UTC maps years 0-99 to 1900-1999.
  const wallClock = new Date(0);
  wallClock.setUTCFullYear(y, mo, d);
  wallClock.setUTCHours(H, M, S, 0);

  // JavaScript normalizes invalid fields (for example February 31), so
  // compare them after construction rather than accepting the rollover.
  if (
    wallClock.getUTCFullYear() !== y ||
    wallClock.getUTCMonth() !== mo ||
    wallClock.getUTCDate() !== d ||
    wallClock.getUTCHours() !== H ||
    wallClock.getUTCMinutes() !== M ||
    wallClock.getUTCSeconds() !== S
  ) {
    return null;
  }

  let offsetMinutes = 0;
  if (sign) {
    const tzH = Number(tzHText);
    const tzM = Number(tzMText);
    if (tzH > 23 || tzM > 59) return null;

    offsetMinutes = (tzH * 60 + tzM) * (sign === '+' ? 1 : -1);
  }

  return new Date(wallClock.getTime() - offsetMinutes * 60_000).toISOString();
}

/**
 * Format a JS Date as a PDF date string `D:YYYYMMDDHHmmSSOHH'mm'`.
 *
 * Emits the offset in PDF's funny `OHH'mm'` form, where the apostrophe
 * after the hour is literal and the offset always carries a sign. UTC
 * is emitted as `+00'00'` (not `Z`) for maximum reader compatibility —
 * the `Z` shorthand is allowed by the spec but not universally
 * supported.
 *
 * Always uses the supplied Date's local fields and offset. For
 * server-side stamps callers typically pass `new Date()` (default).
 */
export function formatPdfDate(d: Date = new Date()): string {
  if (Number.isNaN(d.getTime())) throw new RangeError('Cannot format an invalid Date');

  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const year = d.getFullYear();
  if (year < 0 || year > 9999) throw new RangeError('PDF dates require a four-digit year');

  const tzMinutes = -d.getTimezoneOffset();
  const sign = tzMinutes >= 0 ? '+' : '-';
  const tzH = pad(Math.floor(Math.abs(tzMinutes) / 60));
  const tzM = pad(Math.abs(tzMinutes) % 60);
  return (
    `D:${pad(year, 4)}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}` +
    `${sign}${tzH}'${tzM}'`
  );
}
