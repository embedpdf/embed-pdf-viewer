import { describe, expect, test } from 'vitest';

import { formatPdfDate, pdfDateToIso } from '../../services/src/shared/pdf-date';

describe('PDF date conversion', () => {
  test.each([
    ["D:20260713150000+03'00'", '2026-07-13T12:00:00.000Z'],
    ["D:20260713150000-03'00'", '2026-07-13T18:00:00.000Z'],
    ["D:20260713150000+05'45'", '2026-07-13T09:15:00.000Z'],
    ['D:20260713150000Z', '2026-07-13T15:00:00.000Z'],
    ['D:20260713150000', '2026-07-13T15:00:00.000Z'],
  ])('converts %s to the correct instant', (pdf, expected) => {
    expect(pdfDateToIso(pdf)).toBe(expected);
  });

  test.each([
    '',
    '20260713150000Z',
    "D:20261313150000+03'00'",
    "D:20260231150000+03'00'",
    "D:20260713250000+03'00'",
    "D:20260713150000+24'00'",
    "D:20260713150000+03'60'",
    'D:20260713150000garbage',
  ])('rejects malformed date %j', (pdf) => {
    expect(pdfDateToIso(pdf)).toBeNull();
  });

  test('formatPdfDate round-trips the same instant in the host timezone', () => {
    const date = new Date('2026-07-13T23:59:58.000Z');
    const pdf = formatPdfDate(date);

    expect(pdf).toMatch(/^D:\d{14}[+-]\d{2}'\d{2}'$/);
    expect(pdfDateToIso(pdf)).toBe(date.toISOString());
  });

  test('formatPdfDate rejects an invalid Date', () => {
    expect(() => formatPdfDate(new Date(Number.NaN))).toThrow(RangeError);
  });
});
