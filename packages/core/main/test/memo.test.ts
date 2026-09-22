import { describe, expect, it, vi } from 'vitest';
import { memo, memoByKey } from '../src/memo';

describe('memo', () => {
  it('returns the same result until an input changes', () => {
    let list = [1, 2, 3];
    let factor = 2;
    const compute = vi.fn((values: number[], by: number) => values.map((value) => value * by));
    const doubled = memo(() => [list, factor] as const, compute);
    const first = doubled();
    expect(doubled()).toBe(first);
    expect(compute).toHaveBeenCalledTimes(1);
    factor = 3;
    expect(doubled()).toEqual([3, 6, 9]);
    list = [...list];
    expect(doubled()).not.toBe(first);
    expect(compute).toHaveBeenCalledTimes(3);
  });
});

describe('memoByKey', () => {
  it('keeps one cached result per key', () => {
    const source: Record<number, string[]> = { 1: ['a'], 2: ['b'] };
    const compute = vi.fn((_page: number, items: string[]) =>
      items.map((item) => item.toUpperCase()),
    );
    const upper = memoByKey((page: number) => [source[page]] as const, compute);
    const one = upper(1);
    const two = upper(2);
    expect(upper(1)).toBe(one);
    expect(upper(2)).toBe(two);
    expect(compute).toHaveBeenCalledTimes(2);
    source[1] = ['c'];
    expect(upper(1)).toEqual(['C']);
    expect(upper(2)).toBe(two);
  });

  it('evicts the oldest key beyond maxEntries', () => {
    const compute = vi.fn((key: number, _input: number) => ({ key }));
    const lookup = memoByKey((key: number) => [key] as const, compute, { maxEntries: 2 });
    const first = lookup(1);
    lookup(2);
    lookup(3);
    expect(lookup(1)).not.toBe(first);
    expect(compute).toHaveBeenCalledTimes(4);
  });
});
