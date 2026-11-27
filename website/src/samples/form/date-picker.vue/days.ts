import type { DatePartsInput } from '@embedpdf/vue/form';

/** Today, as the calendar counts: a year, a month from 1, a day. */
export function today(): DatePartsInput {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

/** The days of a month, after the blanks that put the 1st under its weekday (Monday first). */
export function daysOf(year: number, month: number): (number | null)[] {
  const blanks = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const count = new Date(year, month, 0).getDate();
  return [...Array<null>(blanks).fill(null), ...Array.from({ length: count }, (_, at) => at + 1)];
}
