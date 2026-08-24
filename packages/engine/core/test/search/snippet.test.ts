import { describe, expect, test } from 'vitest';
import { buildSnippet } from '../../src/shared';

describe('buildSnippet', () => {
  test('the snippet range reproduces the matched text', () => {
    const text = 'The quick brown fox jumps over the lazy dog near the river bank today';
    const range = { start: text.indexOf('jumps'), length: 5 };
    const s = buildSnippet(text, range);
    expect(s.text.slice(s.matchStart, s.matchStart + s.matchLength)).toBe('jumps');
  });

  test('trims to word boundaries inside the context window', () => {
    const text = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima';
    const range = { start: text.indexOf('foxtrot'), length: 7 };
    const s = buildSnippet(text, range, 12);
    // Starts and ends on whole words, not mid-token.
    expect(s.text.startsWith(' ')).toBe(false);
    expect(s.text.endsWith(' ')).toBe(false);
    expect(text.replace(/\s/g, ' ')).toContain(s.text);
    expect(s.text).toContain('foxtrot');
  });

  test('match at the very start needs no leading context', () => {
    const s = buildSnippet('match at start of page', { start: 0, length: 5 });
    expect(s.matchStart).toBe(0);
    expect(s.text.slice(0, 5)).toBe('match');
  });

  test('accepts a mid-token cut when one long token fills the window', () => {
    const text = 'x'.repeat(200) + 'needle' + 'y'.repeat(200);
    const s = buildSnippet(text, { start: 200, length: 6 }, 20);
    expect(s.text.slice(s.matchStart, s.matchStart + s.matchLength)).toBe('needle');
    expect(s.text.length).toBeLessThanOrEqual(6 + 40);
  });

  test('flattens whitespace 1:1 so offsets survive', () => {
    const text = 'before\n\tthe match\r\nafter words here';
    const range = { start: text.indexOf('match'), length: 5 };
    const s = buildSnippet(text, range);
    expect(s.text).not.toMatch(/[\n\t\r]/);
    expect(s.text.slice(s.matchStart, s.matchStart + s.matchLength)).toBe('match');
  });

  test('never splits surrogate pairs at the window edges', () => {
    const text = '\u{1F600}'.repeat(30) + ' needle ' + '\u{1F600}'.repeat(30);
    const range = { start: text.indexOf('needle'), length: 6 };
    const s = buildSnippet(text, range, 15);
    // A split pair would surface as a lone surrogate — round-tripping
    // through code points must be lossless.
    expect(Array.from(s.text).join('')).toBe(s.text);
    expect(s.text.slice(s.matchStart, s.matchStart + s.matchLength)).toBe('needle');
  });
});
