import { describe, expect, test } from 'vitest';
import {
  boundaryTextOffset,
  charBoundaryAtTextOffset,
  charMapViolation,
  charRangeForTextOffsets,
  isNoncharacter,
  sliceText,
  toPageText,
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

// [A, ×] — the trailing zero-width char must stay outside a range ending at "A".
const trailingDrop: PageTextSnapshot = { text: 'A', charCount: 2, charMap: [[2, 1]] };

// [A, ×, B]
const interiorDrop: PageTextSnapshot = { text: 'AB', charCount: 3, charMap: [[2, 1]] };

// [×, ×, A] — a plateau of two zero-width chars before the first real unit.
const doubleDrop: PageTextSnapshot = {
  text: 'A',
  charCount: 3,
  charMap: [
    [1, 0],
    [2, 0],
  ],
};

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
    // "A" in [×, A, B]: must not include the dropped char's geometry slot.
    expect(charRangeForTextOffsets(leadingDrop, { start: 0, count: 1 })).toEqual({
      start: 1,
      count: 1,
    });
  });

  test('end is left-biased before trailing zero-width characters', () => {
    // "A" in [A, ×]: must not swallow the trailing dropped char.
    expect(charRangeForTextOffsets(trailingDrop, { start: 0, count: 1 })).toEqual({
      start: 0,
      count: 1,
    });
  });

  test('an interior zero-width char belongs to neither neighbour', () => {
    expect(charRangeForTextOffsets(interiorDrop, { start: 0, count: 1 })).toEqual({
      start: 0,
      count: 1,
    }); // "A"
    expect(charRangeForTextOffsets(interiorDrop, { start: 1, count: 1 })).toEqual({
      start: 2,
      count: 1,
    }); // "B"
  });

  test('plateau of several zero-width chars resolves to its far edge', () => {
    expect(charRangeForTextOffsets(doubleDrop, { start: 0, count: 1 })).toEqual({
      start: 2,
      count: 1,
    });
  });

  test('an offset inside a surrogate pair covers the whole character', () => {
    expect(charRangeForTextOffsets(astral, { start: 1, count: 2 })).toEqual({ start: 0, count: 2 });
    expect(charRangeForTextOffsets(astral, { start: 0, count: 1 })).toEqual({ start: 0, count: 1 });
  });

  test('empty input normalizes to a single boundary, never inverts', () => {
    const r = charRangeForTextOffsets(doubleDrop, { start: 0, count: 0 });
    expect(r.count).toBe(0);
    expect(charRangeForTextOffsets(identity, { start: 2, count: 0 })).toEqual({
      start: 2,
      count: 0,
    });
    // A negative count normalizes at the start (documented; see charmap.ts).
    expect(charRangeForTextOffsets(identity, { start: 2, count: -1 })).toEqual({
      start: 2,
      count: 0,
    });
  });
});

describe('sliceText', () => {
  test('full range is always the whole text', () => {
    for (const s of [identity, leadingDrop, trailingDrop, interiorDrop, doubleDrop, astral]) {
      expect(sliceText(s, { start: 0, count: s.charCount })).toBe(s.text);
    }
  });

  test('dropped characters contribute nothing', () => {
    expect(sliceText(leadingDrop, { start: 0, count: 1 })).toBe('');
    expect(sliceText(leadingDrop, { start: 0, count: 2 })).toBe('A');
    expect(sliceText(interiorDrop, { start: 0, count: 2 })).toBe('A');
    expect(sliceText(interiorDrop, { start: 1, count: 2 })).toBe('B');
  });

  test('a supplementary character arrives whole', () => {
    expect(sliceText(astral, { start: 0, count: 1 })).toBe('😀');
    expect(sliceText(astral, { start: 1, count: 1 })).toBe('A');
  });

  test('empty and inverted ranges are empty', () => {
    expect(sliceText(identity, { start: 2, count: 0 })).toBe('');
    expect(sliceText(identity, { start: 2, count: -1 })).toBe('');
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
    expect(
      charMapViolation(3, 2, [
        [1, 0],
        [1, 0],
      ]),
    ).toMatch(/strictly/);
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

describe('toPageText', () => {
  /** The snapshot passes every charMap invariant, and slicing it whole gives its text. */
  function expectValid(snapshot: PageTextSnapshot): void {
    expect(charMapViolation(snapshot.charCount, snapshot.text.length, snapshot.charMap)).toBeNull();
    expect(PageTextSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(sliceText(snapshot, { start: 0, count: snapshot.charCount })).toBe(snapshot.text);
  }

  test('a line break is `\n`: its `\r` keeps its slot and gives no text', () => {
    // [A, \r, \n, B]
    const page = toPageText({ text: 'A\r\nB', charCount: 4 });
    expect(page).toEqual({ text: 'A\nB', charCount: 4, charMap: [[2, 1]] });
    expectValid(page);
    expect(sliceText(page, { start: 1, count: 2 })).toBe('\n');
    // The line break as text maps back to its `\n` alone.
    expect(charRangeForTextOffsets(page, { start: 1, count: 1 })).toEqual({ start: 2, count: 1 });
  });

  test('a lone `\r` becomes `\n`, one unit for one', () => {
    expect(toPageText({ text: 'A\rB', charCount: 3 })).toEqual({ text: 'A\nB', charCount: 3 });
  });

  test('a noncharacter keeps its slot and gives no text', () => {
    // PDFium's joined line-end hyphen: [V, e, r, i, t, a, `U+FFFE`, s, e, r, u, m]
    const page = toPageText({ text: 'Verita\uFFFEserum', charCount: 12 });
    expect(page).toEqual({ text: 'Veritaserum', charCount: 12, charMap: [[7, 6]] });
    expectValid(page);
    expect(charRangeForTextOffsets(page, { start: 0, count: 11 })).toEqual({ start: 0, count: 12 });
  });

  test('a supplementary noncharacter drops both of its units', () => {
    // [A, U+1FFFE, B]: the noncharacter arrives as one character of two units.
    const page = toPageText({ text: 'A\u{1FFFE}B', charCount: 3, charMap: [[2, 3]] });
    expect(page).toEqual({ text: 'AB', charCount: 3, charMap: [[2, 1]] });
    expectValid(page);
  });

  test('anchors the extraction already has are kept, merged with the new ones', () => {
    // [×, 😀, \r, \n, A]: a dropped character, a surrogate pair, a line break.
    const page = toPageText({
      text: '😀\r\nA',
      charCount: 5,
      charMap: [
        [1, 0],
        [2, 2],
      ],
    });
    expect(page).toEqual({
      text: '😀\nA',
      charCount: 5,
      charMap: [
        [1, 0],
        [2, 2],
        [3, 2],
      ],
    });
    expectValid(page);
  });

  test('gives back the same snapshot when there is nothing to change', () => {
    expect(toPageText(identity)).toBe(identity);
    expect(toPageText(astral)).toBe(astral);
  });
});

describe('isNoncharacter', () => {
  test('is true for U+FDD0–U+FDEF and the last two code points of every plane', () => {
    for (const codePoint of [0xfdd0, 0xfdef, 0xfffe, 0xffff, 0x1fffe, 0x10ffff]) {
      expect(isNoncharacter(codePoint)).toBe(true);
    }
    for (const codePoint of [0x41, 0xfdcf, 0xfdf0, 0xfffd, 0xfeff, 0x1fffd]) {
      expect(isNoncharacter(codePoint)).toBe(false);
    }
  });
});
