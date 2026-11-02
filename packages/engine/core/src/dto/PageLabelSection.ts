/**
 * How a page label section numbers its pages (`/S`, ISO 32000-1 §12.4.2):
 * decimal numbers, roman numerals in upper or lower case, or letters in upper
 * or lower case (a to z, then aa to zz).
 */
export type PageLabelStyle =
  | 'decimal'
  | 'upperRoman'
  | 'lowerRoman'
  | 'upperLetters'
  | 'lowerLetters';

/**
 * Pages numbered together (`/PageLabels`): from the section's first page up
 * to the next section's. A page's label is the section's `prefix` followed by
 * its number in `style`, counting from `firstNumber` (`labelAt`).
 *
 * A section stays with the page it starts at, and a page takes the numbering
 * of the section it lands in: page edits move the sections (`sectionsAfter*`
 * in `pages/labels`). The first section always starts at the first page.
 */
export interface PageLabelSection {
  /** The index of its first page. */
  firstPage: number;
  /** How it numbers its pages; `null`: no number, the label is the prefix alone. */
  style: PageLabelStyle | null;
  /** The number of its first page (`/St`). */
  firstNumber: number;
  /** What each of its labels starts with (`/P`); `''` for none. */
  prefix: string;
}
