import type { ObjectNumberRange } from '@embedpdf/engine-core/runtime';

/**
 * Object numbers are handed out and tracked in blocks of up to 32
 * consecutive numbers: `first` and a mask whose bit i is set while
 * `first + i` is unspent. 32 bits keep the mask clear of a signed 64-bit
 * column's sign bit on both dialects.
 *
 * The masks are built with arithmetic, not JavaScript's bit operators,
 * which work on signed 32-bit values: a full block's mask is 2^32 - 1.
 */
export const OBJECT_NUMBER_BLOCK_SIZE = 32;

/** A block as the database stores it. */
export interface ObjectNumberBlock {
  readonly first: number;
  readonly available: number;
}

/** The mask with bits `from` to `from + count - 1` set. */
export function maskOf(from: number, count: number): number {
  return (2 ** count - 1) * 2 ** from;
}

/** Whether bit `index` of `mask` is set. */
export function hasBit(mask: number, index: number): boolean {
  return Math.floor(mask / 2 ** index) % 2 === 1;
}

/** How many bits of `mask` are set. */
export function bitCount(mask: number): number {
  let count = 0;
  for (let index = 0; index < OBJECT_NUMBER_BLOCK_SIZE; index++) {
    if (hasBit(mask, index)) count++;
  }
  return count;
}

/** The numbers a block still holds, in order. */
export function numbersOf(block: ObjectNumberBlock): number[] {
  const numbers: number[] = [];
  for (let index = 0; index < OBJECT_NUMBER_BLOCK_SIZE; index++) {
    if (hasBit(block.available, index)) numbers.push(block.first + index);
  }
  return numbers;
}

/** `count` fresh numbers from `first`, as full blocks of at most 32. */
export function blocksFor(first: number, count: number): ObjectNumberBlock[] {
  const blocks: ObjectNumberBlock[] = [];
  for (let done = 0; done < count; done += OBJECT_NUMBER_BLOCK_SIZE) {
    const size = Math.min(OBJECT_NUMBER_BLOCK_SIZE, count - done);
    blocks.push({ first: first + done, available: maskOf(0, size) });
  }
  return blocks;
}

/**
 * Sorted numbers as runs of consecutive ones: what a client is sent.
 * Neighbouring blocks merge into one run; a block with spent numbers inside
 * splits into several.
 */
export function rangesOf(numbers: readonly number[]): ObjectNumberRange[] {
  const sorted = [...numbers].sort((a, b) => a - b);
  const ranges: { first: number; count: number }[] = [];
  for (const number of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && last.first + last.count === number) last.count++;
    // A repeat stays in the run it is already in.
    else if (!last || last.first + last.count - 1 !== number)
      ranges.push({ first: number, count: 1 });
  }
  return ranges;
}
