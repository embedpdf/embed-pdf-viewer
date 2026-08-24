import { HIGHLIGHT_CLOSE, HIGHLIGHT_OPEN } from './types';

/**
 * The `ts_headline` replacement: a word window around the first term match,
 * with every matched word wrapped in the invisible highlight sentinels the
 * dialog renders as real elements.
 */

/** Window shape, matching the old headline options (MaxWords=32). */
const WINDOW_WORDS = 32;
const WORDS_BEFORE = 8;
const MAX_EXCERPT_CHARS = 320;

type Word = { start: number; end: number; lower: string };

function wordsOf(text: string): Word[] {
  const words: Word[] = [];
  for (const match of text.matchAll(/[A-Za-z0-9]+/g)) {
    const start = match.index ?? 0;
    words.push({ start, end: start + match[0].length, lower: match[0].toLowerCase() });
  }
  return words;
}

function matchesAny(word: Word, terms: string[]): boolean {
  return terms.some((term) => word.lower.startsWith(term));
}

export function makeExcerpt(prose: string, terms: string[]): string {
  const text = prose.replace(/\s+/g, ' ').trim();
  if (!text) return '';

  const words = wordsOf(text);
  const firstHit = terms.length > 0 ? words.findIndex((word) => matchesAny(word, terms)) : -1;

  if (firstHit === -1) {
    const plain = text.slice(0, MAX_EXCERPT_CHARS);
    return plain.length < text.length ? `${plain.trimEnd()} …` : plain;
  }

  const from = Math.max(0, firstHit - WORDS_BEFORE);
  const to = Math.min(words.length, from + WINDOW_WORDS);
  const windowStart = words[from].start;
  const windowEnd = to < words.length ? words[to].start : text.length;

  // Rebuild the window, wrapping matched words as they stream past.
  const parts: string[] = [];
  let cursor = windowStart;
  for (let index = from; index < to; index++) {
    const word = words[index];
    parts.push(text.slice(cursor, word.start));
    const value = text.slice(word.start, word.end);
    parts.push(matchesAny(word, terms) ? `${HIGHLIGHT_OPEN}${value}${HIGHLIGHT_CLOSE}` : value);
    cursor = word.end;
  }
  parts.push(text.slice(cursor, windowEnd));

  const clippedStart = from > 0 ? '… ' : '';
  const clippedEnd = to < words.length ? ' …' : '';
  return `${clippedStart}${parts.join('').trim()}${clippedEnd}`.slice(0, MAX_EXCERPT_CHARS);
}
