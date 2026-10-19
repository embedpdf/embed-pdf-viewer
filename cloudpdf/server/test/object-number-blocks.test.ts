import { describe, expect, test } from 'vitest';

import {
  bitCount,
  blocksFor,
  hasBit,
  maskOf,
  numbersOf,
  rangesOf,
} from '../src/services/objectNumberBlocks';

describe('object number blocks', () => {
  test('a full block is 32 bits, clear of the sign bit', () => {
    expect(maskOf(0, 32)).toBe(2 ** 32 - 1);
    expect(bitCount(maskOf(0, 32))).toBe(32);
    expect(maskOf(3, 2)).toBe(8 + 16);
    expect(hasBit(maskOf(3, 2), 3)).toBe(true);
    expect(hasBit(maskOf(3, 2), 2)).toBe(false);
  });

  test('fresh numbers come as full blocks, the last one shorter', () => {
    expect(blocksFor(1000, 70)).toEqual([
      { first: 1000, available: 2 ** 32 - 1 },
      { first: 1032, available: 2 ** 32 - 1 },
      { first: 1064, available: 2 ** 6 - 1 },
    ]);
  });

  test("a block's numbers skip the spent ones", () => {
    const available = maskOf(0, 32) - maskOf(1, 2);
    expect(numbersOf({ first: 1000, available })).toEqual([
      1000,
      ...Array.from({ length: 29 }, (_, i) => 1003 + i),
    ]);
  });

  test('numbers go on the wire as runs', () => {
    expect(rangesOf([1003, 1001, 1002, 2040, 2041, 2042, 1001])).toEqual([
      { first: 1001, count: 3 },
      { first: 2040, count: 3 },
    ]);
    expect(rangesOf([])).toEqual([]);
  });
});
