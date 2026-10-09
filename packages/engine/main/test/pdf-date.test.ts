import { describe, expect, test } from 'vitest';

import { formatPdfDate, pdfDateToIso } from '../../services/src/shared/pdf-date';

describe('PDF date conversion', () => {
  test.each([
    ["D:20260713150000+03'00'", '2026-07-13T15:00:00+03:00'],
    ["D:20260713150000-03'00'", '2026-07-13T15:00:00-03:00'],
    ["D:20260713150000+05'45'", '2026-07-13T15:00:00+05:45'],
    ['D:20260713150000Z', '2026-07-13T15:00:00Z'],
    ["D:20260713150000+00'00'", '2026-07-13T15:00:00Z'],
    ["D:20260713150000Z00'00'", '2026-07-13T15:00:00Z'],
    // No offset: the relation to UTC is unknown, so none is invented.
    ['D:20260713150000', '2026-07-13T15:00:00'],
    // Readers in the wild: no prefix, loose apostrophes, an hours-only offset.
    ['20260713150000Z', '2026-07-13T15:00:00Z'],
    ["D:20260713150000+03'00", '2026-07-13T15:00:00+03:00'],
    ['D:20260713150000-07', '2026-07-13T15:00:00-07:00'],
    // Left-out fields take the spec's defaults.
    ['D:2026', '2026-01-01T00:00:00'],
    ["D:202607131500+02'00'", '2026-07-13T15:00:00+02:00'],
  ])('reads %s as %s, keeping its offset', (pdf, expected) => {
    expect(pdfDateToIso(pdf)).toBe(expected);
  });

  test.each([
    '',
    'not a date',
    "D:20261313150000+03'00'",
    "D:20260231150000+03'00'",
    'D:20250229120000Z',
    "D:20260713250000+03'00'",
    "D:20260713150000+24'00'",
    "D:20260713150000+03'60'",
    'D:20260713150000garbage',
  ])('reads malformed %j as null', (pdf) => {
    expect(pdfDateToIso(pdf)).toBeNull();
  });

  test('a leap day is a date', () => {
    expect(pdfDateToIso('D:20240229120000Z')).toBe('2024-02-29T12:00:00Z');
  });

  test.each([
    ['2017-07-12T21:44:38-07:00', "D:20170712214438-07'00'"],
    ['2017-07-12T21:44:38+05:30', "D:20170712214438+05'30'"],
    ['2017-07-12T21:44:38Z', "D:20170712214438+00'00'"],
    ['2017-07-12T21:44:38', 'D:20170712214438'],
    ['2017-07-12T21:44:38.999Z', "D:20170712214438+00'00'"],
    ['2017-07-12T21:44Z', "D:20170712214400+00'00'"],
  ])('writes %s as %s, in its own offset', (iso, expected) => {
    expect(formatPdfDate(iso)).toBe(expected);
  });

  test('a read date written back is the same PDF date', () => {
    for (const pdf of ["D:20170712214438-07'00'", "D:20170712214438+05'30'", 'D:20170712214438']) {
      expect(formatPdfDate(pdfDateToIso(pdf)!)).toBe(pdf);
    }
  });

  test('a Date is an instant, written in UTC', () => {
    expect(formatPdfDate(new Date('2026-07-13T23:59:58.500+02:00'))).toBe(
      "D:20260713215958+00'00'",
    );
  });

  test('an invalid Date or string is refused', () => {
    expect(() => formatPdfDate(new Date(Number.NaN))).toThrow(RangeError);
    expect(() => formatPdfDate('2026-02-30T00:00:00Z')).toThrow(/not an ISO 8601/);
    expect(() => formatPdfDate('yesterday')).toThrow(/not an ISO 8601/);
  });
});
