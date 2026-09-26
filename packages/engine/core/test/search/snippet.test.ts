import { describe, expect, test } from 'vitest';
import { buildSnippet } from '../../src/shared';
import type { SearchSnippet } from '../../src/shared';

/** The snippet as one line of text. */
const whole = (s: SearchSnippet): string => s.before + s.match + s.after;

describe('buildSnippet', () => {
  test('the match part is the matched text, between its context', () => {
    const text = 'The quick brown fox jumps over the lazy dog near the river bank today';
    const s = buildSnippet(text, { start: text.indexOf('jumps'), count: 5 });
    expect(s.match).toBe('jumps');
    expect(s.before.endsWith('fox ')).toBe(true);
    expect(s.after.startsWith(' over')).toBe(true);
  });

  test('trims to word boundaries inside the context window', () => {
    const text = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima';
    const s = buildSnippet(text, { start: text.indexOf('foxtrot'), count: 7 }, 12);
    // Starts and ends on whole words, not mid-token.
    expect(whole(s).startsWith(' ')).toBe(false);
    expect(whole(s).endsWith(' ')).toBe(false);
    expect(text.replace(/\s/g, ' ')).toContain(whole(s));
    expect(s.match).toBe('foxtrot');
  });

  test('a match at the very start has no text before it', () => {
    const s = buildSnippet('match at start of page', { start: 0, count: 5 });
    expect(s.before).toBe('');
    expect(s.match).toBe('match');
  });

  test('accepts a mid-token cut when one long token fills the window', () => {
    const text = 'x'.repeat(200) + 'needle' + 'y'.repeat(200);
    const s = buildSnippet(text, { start: 200, count: 6 }, 20);
    expect(s.match).toBe('needle');
    expect(whole(s).length).toBeLessThanOrEqual(6 + 40);
  });

  test('flattens whitespace to spaces in every part', () => {
    const text = 'before\n\tthe match\r\nafter words here';
    const s = buildSnippet(text, { start: text.indexOf('match'), count: 5 });
    expect(whole(s)).not.toMatch(/[\n\t\r]/);
    expect(s.match).toBe('match');
    expect(s.after.startsWith('  after')).toBe(true);
  });

  test('never splits surrogate pairs at the window edges', () => {
    const text = '\u{1F600}'.repeat(30) + ' needle ' + '\u{1F600}'.repeat(30);
    const s = buildSnippet(text, { start: text.indexOf('needle'), count: 6 }, 15);
    // A split pair would surface as a lone surrogate — round-tripping
    // through code points must be lossless.
    expect(Array.from(whole(s)).join('')).toBe(whole(s));
    expect(s.match).toBe('needle');
  });
});
