import { describe, expect, test } from 'vitest';
import {
  boundaryTextOffset,
  charBoundaryAtTextOffset,
  charMapViolation,
  charRangeForTextOffsets,
  sliceTextByChars,
} from '../../src/shared';
import type { PageTextSnapshot } from '../../src/shared';
import { PageTextSnapshotSchema } from '../../src/wire/schemas';

/**
 * Fixtures, named by their character list. "×" marks a non-printing
 * character (occupies a character slot, contributes zero text units);
 * "😀" contributes a surrogate pair (two units).
 */
const identity: PageTextSnapshot = { text: 'ABC', charCount: 3 };

// bug_1139 shape: leading non-printing char shifts every text index by one.
const leadingDrop: PageTextSnapshot = { text: 'AB', charCount: 3, charMap: [[1, 0]] };

// [A, ×] — the trailing zero-width char must stay OUTSIDE a range ending at "A".
const trailingDrop: PageTextSnapshot = { text: 'A', charCount: 2, charMap: [[2, 1]] };

// [A, ×, B]
const interiorDrop: PageTextSnapshot = { text: 'AB', charCount: 3, charMap: [[2, 1]] };

// [×, ×, A] — a plateau of two zero-width chars before the first real unit.
const doubleDrop: PageTextSnapshot = { text: 'A', charCount: 3, charMap: [[1, 0], [2, 0]] };

// [😀, A]
const astral: PageTextSnapshot = { text: '😀A', charCount: 2, charMap: [[1, 2]] };

describe('boundaryTextOffset', () => {
  test('identity map is the identity, clamped', () => {
    expect(boundaryTextOffset(identity, 0)).toBe(0);
    expect(boundaryTextOffset(identity, 2)).toBe(2);
    expect(boundaryTextOffset(identity, 3)).toBe(3);
    expect(boundaryTextOffset(identity, 99)).toBe(3);
    expect(boundaryTextOffset(identity, -1)).toBe(0);
  });

  test('dropped characters advance the boundary but not the offset', () => {
    expect([0, 1, 2, 3].map((b) => boundaryTextOffset(leadingDrop, b))).toEqual([0, 0, 1, 2]);
    expect([0, 1, 2].map((b) => boundaryTextOffset(trailingDrop, b))).toEqual([0, 1, 1]);
    expect([0, 1, 2, 3].map((b) => boundaryTextOffset(doubleDrop, b))).toEqual([0, 0, 0, 1]);
  });

  test('a supplementary character advances by two', () => {
    expect([0, 1, 2].map((b) => boundaryTextOffset(astral, b))).toEqual([0, 2, 3]);
  });

  test('the final boundary always lands on text.length', () => {
    for (const s of [identity, leadingDrop, trailingDrop, interiorDrop, doubleDrop, astral]) {
      expect(boundaryTextOffset(s, s.charCount)).toBe(s.text.length);
    }
  });
});

describe('charRangeForTextOffsets', () => {
  test('start is right-biased past leading zero-width characters', () => {
    // "A" in [×, A, B]: must NOT include the dropped char's geometry slot.
    expect(charRangeForTextOffsets(leadingDrop, 0, 1)).toEqual({ start: 1, end: 2 });
  });

  test('end is left-biased before trailing zero-width characters', () => {
    // "A" in [A, ×]: must NOT swallow the trailing dropped char.
    expect(charRangeForTextOffsets(trailingDrop, 0, 1)).toEqual({ start: 0, end: 1 });
  });

  test('an interior zero-width char belongs to neither neighbour', () => {
    expect(charRangeForTextOffsets(interiorDrop, 0, 1)).toEqual({ start: 0, end: 1 }); // "A"
    expect(charRangeForTextOffsets(interiorDrop, 1, 2)).toEqual({ start: 2, end: 3 }); // "B"
  });

  test('plateau of several zero-width chars resolves to its far edge', () => {
    expect(charRangeForTextOffsets(doubleDrop, 0, 1)).toEqual({ start: 2, end: 3 });
  });

  test('an offset inside a surrogate pair covers the whole character', () => {
    expect(charRangeForTextOffsets(astral, 1, 3)).toEqual({ start: 0, end: 2 });
    expect(charRangeForTextOffsets(astral, 0, 1)).toEqual({ start: 0, end: 1 });
  });

  test('empty input normalizes to a single boundary, never inverts', () => {
    const r = charRangeForTextOffsets(doubleDrop, 0, 0);
    expect(r.start).toBe(r.end);
    expect(charRangeForTextOffsets(identity, 2, 2)).toEqual({ start: 2, end: 2 });
    // Inverted input normalizes at startOffset (documented; see charmap.ts).
    expect(charRangeForTextOffsets(identity, 2, 1)).toEqual({ start: 2, end: 2 });
  });
});

describe('sliceTextByChars', () => {
  test('full range is always the whole text', () => {
    for (const s of [identity, leadingDrop, trailingDrop, interiorDrop, doubleDrop, astral]) {
      expect(sliceTextByChars(s, 0, s.charCount)).toBe(s.text);
    }
  });

  test('dropped characters contribute nothing', () => {
    expect(sliceTextByChars(leadingDrop, 0, 1)).toBe('');
    expect(sliceTextByChars(leadingDrop, 0, 2)).toBe('A');
    expect(sliceTextByChars(interiorDrop, 0, 2)).toBe('A');
    expect(sliceTextByChars(interiorDrop, 1, 3)).toBe('B');
  });

  test('a supplementary character arrives whole', () => {
    expect(sliceTextByChars(astral, 0, 1)).toBe('😀');
    expect(sliceTextByChars(astral, 1, 2)).toBe('A');
  });

  test('empty and inverted ranges are empty', () => {
    expect(sliceTextByChars(identity, 2, 2)).toBe('');
    expect(sliceTextByChars(identity, 2, 1)).toBe('');
  });
});

describe('charBoundaryAtTextOffset biases', () => {
  test('start and end disagree exactly on plateaus', () => {
    // [A, ×] plateau at offset 1: start crosses it, end stops before it.
    expect(charBoundaryAtTextOffset(trailingDrop, 1, 'start')).toBe(2);
    expect(charBoundaryAtTextOffset(trailingDrop, 1, 'end')).toBe(1);
    // No plateau at offset 0 of [A, ×]:
    expect(charBoundaryAtTextOffset(trailingDrop, 0, 'start')).toBe(0);
    expect(charBoundaryAtTextOffset(trailingDrop, 0, 'end')).toBe(0);
  });
});

describe('charMapViolation', () => {
  test('accepts all fixtures', () => {
    for (const s of [identity, leadingDrop, trailingDrop, interiorDrop, doubleDrop, astral]) {
      expect(charMapViolation(s.charCount, s.text.length, s.charMap)).toBeNull();
    }
  });

  test('identity requires matching lengths', () => {
    expect(charMapViolation(3, 2, undefined)).toMatch(/identity/);
    expect(charMapViolation(3, 2, [])).toMatch(/identity/);
  });

  test('rejects non-strictly-increasing and out-of-range anchors', () => {
    expect(charMapViolation(3, 2, [[1, 0], [1, 0]])).toMatch(/strictly/);
    expect(charMapViolation(3, 2, [[0, 0]])).toMatch(/strictly/);
    expect(charMapViolation(3, 2, [[4, 2]])).toMatch(/outside/);
  });

  test('rejects steps other than 0 or 2 (redundant anchors are malformed)', () => {
    // Anchor implying the previous char contributed exactly 1 unit is
    // redundant — the canonical form has no such anchor.
    expect(charMapViolation(3, 3, [[1, 1]])).toMatch(/expected 0 or 2/);
    expect(charMapViolation(3, 5, [[1, 3]])).toMatch(/expected 0 or 2/);
  });

  test('rejects a tail that misses text.length', () => {
    expect(charMapViolation(3, 3, [[1, 0]])).toMatch(/text length/);
  });
});

describe('PageTextSnapshotSchema', () => {
  test('accepts identity and mapped snapshots', () => {
    expect(PageTextSnapshotSchema.parse(identity)).toEqual(identity);
    expect(PageTextSnapshotSchema.parse(leadingDrop)).toEqual(leadingDrop);
  });

  test('rejects malformed maps and inconsistent identity', () => {
    expect(() => PageTextSnapshotSchema.parse({ text: 'AB', charCount: 3 })).toThrow();
    expect(() =>
      PageTextSnapshotSchema.parse({ text: 'AB', charCount: 3, charMap: [[1, 1]] }),
    ).toThrow();
  });
});
