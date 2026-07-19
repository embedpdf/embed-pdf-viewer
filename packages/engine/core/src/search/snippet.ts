import type { SearchMatchRange } from './fold';
import type { SearchSnippet } from './types';

/** Default context on each side of a match, in code units. */
export const SEARCH_SNIPPET_CONTEXT = 48;

const WHITESPACE = /\s/;
// Length-preserving: every whitespace unit becomes one plain space, so
// `matchStart`/`matchLength` stay valid offsets into the flattened text.
const WHITESPACE_ALL = /\s/g;

const isLowSurrogate = (text: string, index: number): boolean => {
  const unit = text.charCodeAt(index);
  return unit >= 0xdc00 && unit <= 0xdfff;
};

/**
 * The `'full'`-mode excerpt around one match: up to `context` code units
 * of page text on each side, trimmed to a whitespace boundary when one
 * exists inside the window (so snippets start and end on whole words),
 * never splitting a surrogate pair, whitespace flattened 1:1.
 */
export function buildSnippet(
  text: string,
  range: SearchMatchRange,
  context: number = SEARCH_SNIPPET_CONTEXT,
): SearchSnippet {
  const matchEnd = range.start + range.length;

  let start = Math.max(0, range.start - context);
  if (start > 0) {
    // Cut at the first whitespace inside the leading context, if any —
    // otherwise accept the mid-word cut (one very long token).
    for (let i = start; i < range.start; i++) {
      if (WHITESPACE.test(text[i])) {
        start = i + 1;
        break;
      }
    }
    if (isLowSurrogate(text, start)) start++;
  }

  let end = Math.min(text.length, matchEnd + context);
  if (end < text.length) {
    for (let i = end - 1; i >= matchEnd; i--) {
      if (WHITESPACE.test(text[i])) {
        end = i;
        break;
      }
    }
    if (isLowSurrogate(text, end)) end--;
  }

  return {
    text: text.slice(start, end).replace(WHITESPACE_ALL, ' '),
    matchStart: range.start - start,
    matchLength: range.length,
  };
}
