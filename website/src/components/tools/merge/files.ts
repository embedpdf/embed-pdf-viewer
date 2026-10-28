/**
 * The merge tool's plain helpers: which pages are chosen, the order of the files, and what the
 * merged file is called. No engine and no DOM, so they're tested on their own.
 */

import { baseName } from '../shared/files';

/**
 * Pages, 0-based and in order, as people write them: `1-3, 8`. `dash` joins a range: a hyphen
 * for a field people type in, an en dash for a label.
 */
export function formatPageRanges(pages: readonly number[], dash = '-'): string {
  const ranges: string[] = [];
  for (let index = 0; index < pages.length; index++) {
    const start = pages[index]!;
    let end = start;
    while (pages[index + 1] === end + 1) end = pages[++index]!;
    ranges.push(end > start ? `${start + 1}${dash}${end + 1}` : `${start + 1}`);
  }
  return ranges.join(', ');
}

/**
 * The pages typed as `1-3, 8`, 0-based, in order and once each. Forgiving where intent is clear:
 * spaces, en dashes, a backwards range (`5-3`), an open end (`10-` to the last page, `-3` from
 * the first), and a range running past the end, which stops at the last page. `null` when it
 * doesn't read as pages of this file: a word, a zero, or a page past the end.
 */
export function parsePageRanges(text: string, pageCount: number): number[] | null {
  const tokens = text
    .replace(/\s*[-–—]\s*/g, '-')
    .split(/[\s,;]+/)
    .filter(Boolean);
  const pages = new Set<number>();
  for (const token of tokens) {
    const match = /^(\d*)(-?)(\d*)$/.exec(token);
    if (!match || (!match[1] && !match[3])) return null;
    const [, from, dash, to] = match;
    const first = from ? Number(from) : 1;
    const last = dash ? (to ? Number(to) : pageCount) : first;
    const low = Math.min(first, last);
    const high = Math.min(Math.max(first, last), pageCount);
    if (low < 1 || low > pageCount) return null;
    for (let page = low; page <= high; page++) pages.add(page - 1);
  }
  return [...pages].sort((left, right) => left - right);
}

/**
 * The name the merged file is saved under, from what the user typed: always one `.pdf`, and
 * nothing a file system refuses. Empty falls back to `merged.pdf`.
 */
export function outputFileName(typed: string): string {
  const cleaned = baseName(typed.replace(/[\\/:*?"<>|\p{Cc}]+/gu, ' ').replace(/\s+/g, ' '));
  return `${cleaned === 'Untitled' ? 'merged' : cleaned}.pdf`;
}

/** Files in name order the way people number them: `scan 2` before `scan 10`. */
export function sortByName<T extends { readonly name: string }>(files: readonly T[]): T[] {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  return [...files].sort((left, right) => collator.compare(left.name, right.name));
}

/** `items` with the one at `from` moved to `to`. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return next;
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved);
  return next;
}
