/**
 * Page labels as sections (`PageLabelSection`): the label of a page, and
 * where the sections go when pages move, come or go. The engine writes
 * `/PageLabels` with these rules and a viewer predicts with them, so both
 * label the pages the same way:
 *
 *   - a section stays with the page it starts at, and a page takes the
 *     numbering of the section it lands in;
 *   - when a section's first page goes, the section starts on its next page,
 *     and a section left with no pages goes;
 *   - the first section always starts at the first page, so pages put before
 *     every page join it;
 *   - a move is a delete followed by an insert.
 *
 * Each returns the sections it was given when they stay as they are.
 */
import type { PageLabelSection, PageLabelStyle } from '../dto/PageLabelSection';

/**
 * The label of the page at `index`: its section's prefix and its number in the
 * section's style, as PDFium writes them (`FPDF_GetPageLabel`). `null` when no
 * section covers it, or the label is empty.
 */
export function labelAt(sections: readonly PageLabelSection[], index: number): string | null {
  let section: PageLabelSection | undefined;
  for (const each of sections) {
    if (each.firstPage > index) break;
    section = each;
  }
  if (!section) return null;
  const label =
    section.prefix + numberIn(section.style, section.firstNumber + index - section.firstPage);
  return label === '' ? null : label;
}

/** The sections once the pages at `indexes` (of `pageCount`) are deleted. */
export function sectionsAfterDelete(
  sections: readonly PageLabelSection[],
  pageCount: number,
  indexes: readonly number[],
): readonly PageLabelSection[] {
  if (sections.length === 0 || indexes.length === 0) return sections;
  const deleted = new Set(indexes);
  // keptBefore[i]: how many pages before index i stay.
  const keptBefore = [0];
  for (let index = 0; index < pageCount; index++) {
    keptBefore.push(keptBefore[index]! + (deleted.has(index) ? 0 : 1));
  }
  const kept = (index: number) => keptBefore[Math.min(Math.max(index, 0), pageCount)]!;
  const next: PageLabelSection[] = [];
  sections.forEach((section, at) => {
    const end = sections[at + 1]?.firstPage ?? pageCount;
    if (kept(end) === kept(section.firstPage)) return;
    // Its first page that stays, which is where the pages before it end.
    const firstPage = kept(section.firstPage);
    next.push(firstPage === section.firstPage ? section : { ...section, firstPage });
  });
  return sameSections(next, sections) ? sections : next;
}

/**
 * The sections once `count` pages come in at `at`: a section that starts at or
 * after `at` moves along with its first page, so the new pages take the
 * numbering of the section before them, or the first section's at the start.
 */
export function sectionsAfterInsert(
  sections: readonly PageLabelSection[],
  at: number,
  count: number,
): readonly PageLabelSection[] {
  if (count <= 0) return sections;
  let changed = false;
  const next = sections.map((section) => {
    if (section.firstPage === 0 || section.firstPage < at) return section;
    changed = true;
    return { ...section, firstPage: section.firstPage + count };
  });
  return changed ? next : sections;
}

/**
 * The sections once a move that changes the order takes the pages at
 * `indexes` (of `pageCount`) out and puts them back together at `at`, the
 * index of the first of them afterwards: a delete, then an insert.
 */
export function sectionsAfterMove(
  sections: readonly PageLabelSection[],
  pageCount: number,
  indexes: readonly number[],
  at: number,
): readonly PageLabelSection[] {
  return sectionsAfterInsert(sectionsAfterDelete(sections, pageCount, indexes), at, indexes.length);
}

/** Whether two lists of sections say the same. */
export function sameSections(
  left: readonly PageLabelSection[],
  right: readonly PageLabelSection[],
): boolean {
  return (
    left.length === right.length &&
    left.every((section, at) => {
      const other = right[at]!;
      return (
        section.firstPage === other.firstPage &&
        section.style === other.style &&
        section.firstNumber === other.firstNumber &&
        section.prefix === other.prefix
      );
    })
  );
}

/* ── numbers ────────────────────────────────────────────────────────────── */

const ROMAN: readonly (readonly [number, string])[] = [
  [1000, 'm'],
  [900, 'cm'],
  [500, 'd'],
  [400, 'cd'],
  [100, 'c'],
  [90, 'xc'],
  [50, 'l'],
  [40, 'xl'],
  [10, 'x'],
  [9, 'ix'],
  [5, 'v'],
  [4, 'iv'],
  [1, 'i'],
];

/** `number` in `style`, as PDFium writes it; nothing for a number a style can't write. */
function numberIn(style: PageLabelStyle | null, number: number): string {
  switch (style) {
    case null:
      return '';
    case 'decimal':
      return String(number);
    case 'upperRoman':
      return roman(number).toUpperCase();
    case 'lowerRoman':
      return roman(number);
    case 'upperLetters':
      return letters(number).toUpperCase();
    case 'lowerLetters':
      return letters(number);
  }
}

/** Below a million; nothing for 0 and below. */
function roman(number: number): string {
  let left = number % 1_000_000;
  let out = '';
  for (const [value, digits] of ROMAN) {
    while (left >= value) {
      out += digits;
      left -= value;
    }
  }
  return out;
}

/** 1 → a, 26 → z, 27 → aa, 52 → zz, 53 → aaa; nothing for 0 and below. */
function letters(number: number): string {
  if (number <= 0) return '';
  const from = number - 1;
  return String.fromCharCode(97 + (from % 26)).repeat((Math.floor(from / 26) + 1) % 1000);
}
