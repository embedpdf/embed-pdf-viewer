import { foldText, toOriginalRange } from './fold';
import type { FoldedText, FoldOptions, SearchMatchRange } from './fold';
import type { SearchQuery } from './types';

/**
 * The fold flavor a literal query needs. Haystack and needle MUST be
 * folded with the same options; corpus caches key their pre-folded text
 * on this (the default `{}` fold is the persistable one — non-default
 * queries fold the original page text at query time).
 */
export function foldOptionsFor(query: SearchQuery): FoldOptions {
  return { keepCase: !!query.matchCase, keepMarks: !!query.matchDiacritics };
}

// ONE definition of "word character" for the whole search subsystem —
// Unicode letters/digits, not JS \b's ASCII set — shared by the literal
// boundary check and the regex wholeWord post-filter, so the wholeWord
// toggle means the same thing in both modes ("caf" never whole-word
// matches inside "café", regex or not).
const WORD_UNIT = /[\p{L}\p{N}_]/u;
const MARK = /\p{M}/u;

/** Whether the code point ENDING at `index` (exclusive) is a word char. */
export function wordBefore(text: string, index: number): boolean {
  if (index <= 0) return false;
  // Step back over a low surrogate to test the full code point.
  const unit = text.charCodeAt(index - 1);
  const start = unit >= 0xdc00 && unit <= 0xdfff && index >= 2 ? index - 2 : index - 1;
  return WORD_UNIT.test(String.fromCodePoint(text.codePointAt(start)!));
}

/** Whether the code point starting at `index` is a word char. */
export function wordAt(text: string, index: number): boolean {
  if (index >= text.length) return false;
  return WORD_UNIT.test(String.fromCodePoint(text.codePointAt(index)!));
}

/**
 * All non-overlapping literal matches, in original code-unit space.
 * `haystack` must have been folded with `foldOptionsFor(query)`.
 */
export function matchLiteral(haystack: FoldedText, query: SearchQuery): SearchMatchRange[] {
  const needle = foldText(query.text, foldOptionsFor(query)).folded;
  // Nothing searchable: empty or whitespace-only needles would "match"
  // every collapsed space.
  if (needle.trim().length === 0) return [];

  const out: SearchMatchRange[] = [];
  let from = 0;
  while (from <= haystack.folded.length - needle.length) {
    const at = haystack.folded.indexOf(needle, from);
    if (at < 0) break;
    if (
      query.wholeWord &&
      (wordBefore(haystack.folded, at) || wordAt(haystack.folded, at + needle.length))
    ) {
      from = at + 1;
      continue;
    }
    // Diacritic-sensitive folds are decomposed (base + marks), so a bare
    // needle would otherwise match just the base letters of an accented
    // char — "cafe" ending right before the U+0301 of "café". A match may
    // not end mid-character.
    if (query.matchDiacritics && at + needle.length < haystack.folded.length) {
      const after = haystack.folded.codePointAt(at + needle.length)!;
      if (MARK.test(String.fromCodePoint(after))) {
        from = at + 1;
        continue;
      }
    }
    out.push(toOriginalRange(haystack, at, needle.length));
    from = at + needle.length;
  }
  return out;
}
