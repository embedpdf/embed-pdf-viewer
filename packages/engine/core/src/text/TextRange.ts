import type { PageRef } from '../identity/PageRef';

/**
 * Characters on a page, in its character space: `count` characters from
 * `start`. The one range shape: selections, search matches, `slice()` and
 * `segments()` all take or return it.
 */
export interface TextRange {
  start: number;
  count: number;
}

/** A {@link TextRange} on a page, such as a search match. */
export interface PageTextRange extends TextRange {
  page: PageRef;
}
