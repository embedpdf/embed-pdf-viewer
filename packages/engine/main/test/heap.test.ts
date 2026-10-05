import { describe, expect, test } from 'vitest';
import { IndexedPriorityHeap } from '../src/worker/IndexedPriorityHeap';

describe('IndexedPriorityHeap', () => {
  test('pops max-priority first, FIFO on ties', () => {
    const heap = new IndexedPriorityHeap<string>();
    heap.push('a', 1);
    heap.push('b', 5);
    heap.push('c', 5);
    heap.push('d', 3);
    expect(heap.popMax()).toBe('b');
    expect(heap.popMax()).toBe('c');
    expect(heap.popMax()).toBe('d');
    expect(heap.popMax()).toBe('a');
    expect(heap.popMax()).toBeUndefined();
  });

  test('remove(handle) takes the right element out without disturbing order', () => {
    const heap = new IndexedPriorityHeap<string>();
    heap.push('a', 1);
    const hb = heap.push('b', 5);
    heap.push('c', 5);
    heap.push('d', 3);
    expect(heap.remove(hb)).toBe(true);
    expect(heap.popMax()).toBe('c');
    expect(heap.popMax()).toBe('d');
    expect(heap.popMax()).toBe('a');
  });

  test('remove returns false on stale handle', () => {
    const heap = new IndexedPriorityHeap<string>();
    const ha = heap.push('a', 1);
    expect(heap.remove(ha)).toBe(true);
    expect(heap.remove(ha)).toBe(false);
  });

  test('handles many random ops without losing order invariants', () => {
    const heap = new IndexedPriorityHeap<number>();
    const refs: {
      handle: ReturnType<IndexedPriorityHeap<number>['push']>;
      pri: number;
      value: number;
    }[] = [];
    for (let i = 0; i < 200; i++) {
      const pri = Math.floor(Math.random() * 50);
      refs.push({ handle: heap.push(i, pri), pri, value: i });
    }
    // Remove half of them.
    for (let i = 0; i < refs.length; i += 2) heap.remove(refs[i].handle);

    let prev = Infinity;
    let popped = 0;
    while (heap.size > 0) {
      const v = heap.popMax();
      if (v === undefined) break;
      const ref = refs.find((r) => r.value === v);
      expect(ref).toBeTruthy();
      expect(ref!.pri).toBeLessThanOrEqual(prev);
      prev = ref!.pri;
      popped++;
    }
    expect(popped).toBe(100);
  });

  test('ranks order items of one priority, below any higher priority', () => {
    const heap = new IndexedPriorityHeap<string>();
    heap.push('render-low', 150, 1);
    heap.push('write', 200);
    heap.push('render-high', 150, 9);
    heap.push('read', 100, 50);
    expect([heap.popMax(), heap.popMax(), heap.popMax(), heap.popMax()]).toEqual([
      'write',
      'render-high',
      'render-low',
      'read',
    ]);
  });

  test('setRank moves a waiting item, which keeps its place among equals', () => {
    const heap = new IndexedPriorityHeap<string>();
    heap.push('a', 0, 5);
    const b = heap.push('b', 0, 1);
    heap.push('c', 0, 5);
    const d = heap.push('d', 0, 9);
    expect(heap.setRank(b, 5)).toBe(true); // now equal to a and c, inserted between them
    expect(heap.setRank(d, 0)).toBe(true);
    expect([heap.popMax(), heap.popMax(), heap.popMax(), heap.popMax()]).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
    expect(heap.setRank(b, 7)).toBe(false); // gone
  });
});
