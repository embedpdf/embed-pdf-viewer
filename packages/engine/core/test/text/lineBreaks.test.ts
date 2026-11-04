import { describe, expect, test } from 'vitest';
import { toLineBreaks } from '../../src/shared';

describe('toLineBreaks', () => {
  test('spells every line break, however written, as the one asked for', () => {
    expect(toLineBreaks('a\r\nb\rc\nd', '\n')).toBe('a\nb\nc\nd');
    expect(toLineBreaks('a\r\nb\rc\nd', '\r')).toBe('a\rb\rc\rd');
  });

  test('a `\\r\\n` pair is one line break, not two', () => {
    expect(toLineBreaks('a\r\n\r\nb', '\n')).toBe('a\n\nb');
  });

  test('text without line breaks is unchanged', () => {
    expect(toLineBreaks('one line', '\r')).toBe('one line');
  });
});
