import { foldText } from './fold';
import type { SearchMatchRange } from './fold';
import { foldOptionsFor, matchLiteral } from './literal';
import { matchRegex } from './regex';
import type { SearchQuery } from './types';

/**
 * The whole match stage in one pure call: page text in, original-space
 * match ranges out. Engines with a pre-folded corpus for the default fold
 * skip this and call `matchLiteral` on the cached `FoldedText` directly;
 * everything else (non-default fold options, regex, tests) comes through
 * here.
 */
export function matchPageText(text: string, query: SearchQuery): SearchMatchRange[] {
  if (query.regex) return matchRegex(text, query);
  return matchLiteral(foldText(text, foldOptionsFor(query)), query);
}
