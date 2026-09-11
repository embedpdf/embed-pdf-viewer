import { describe, expect, test } from 'vitest';
import { EdgeResolver, USAGE_INCOMPLETE, type ObjectReferrer } from '../../src/shared';

/** A referrer index: object → who references it and through which label. */
type Index = Record<number, ObjectReferrer[]>;
const edge = (parent: number, label: string): ObjectReferrer => ({ parent, label });
const reader = (index: Index) => {
  let reads = 0;
  return { read: (n: number) => (reads++, index[n] ?? []), reads: () => reads };
};

describe('EdgeResolver: anchored edges through unchanged objects', () => {
  test('an edge from an anchor is kept as-is; one from an unchanged object is resolved with joined labels', () => {
    // widget 20 --AP--> apDict 22 --N--> stream 23 (changed). Anchors: {20}.
    const { read } = reader({ 23: [edge(22, 'N')], 22: [edge(20, 'AP')] });
    const r = new EdgeResolver(read, new Set([20, 23]));
    expect(r.resolve(23)).toEqual([{ parent: 20, label: 'AP/N', via: [22] }]);
  });

  test('a shared unchanged dictionary yields one anchored edge per anchor', () => {
    const { read } = reader({ 23: [edge(22, 'N')], 22: [edge(20, 'AP'), edge(40, 'AP')] });
    const r = new EdgeResolver(read, new Set([20, 40, 23]));
    expect(r.resolve(23)).toEqual([
      { parent: 20, label: 'AP/N', via: [22] },
      { parent: 40, label: 'AP/N', via: [22] },
    ]);
  });

  test('a diamond lattice costs its size, not its path count (memoised)', () => {
    // Layers of two unchanged nodes, each referenced by both nodes of the layer above; the top is an anchor.
    const index: Index = {};
    const depth = 12;
    let ids = [1000]; // anchor
    for (let d = 0; d < depth; d++) {
      const next = [2000 + d * 2, 2001 + d * 2];
      for (const n of next) index[n] = ids.map((p) => edge(p, `k${d}`));
      ids = next;
    }
    index[3000] = ids.map((p) => edge(p, 'leaf'));
    const { read, reads } = reader(index);
    const r = new EdgeResolver(read, new Set([1000, 3000]), { maxDepth: 64, maxEdgesPerObject: 1_000_000, maxReads: 1_000_000 });
    const out = r.resolve(3000);
    expect(out).not.toBe(USAGE_INCOMPLETE);
    // 2^depth paths, but every path ends at the single anchor with the same shape; reads stay linear in nodes.
    expect(reads()).toBeLessThanOrEqual(depth * 2 + 2);
    expect((out as ObjectReferrer[]).length).toBe(2 ** depth);
  });

  test('exceeding the per-object edge budget reports incomplete', () => {
    const index: Index = {};
    let ids = [1000];
    for (let d = 0; d < 10; d++) {
      const next = [2000 + d * 2, 2001 + d * 2];
      for (const n of next) index[n] = ids.map((p) => edge(p, `k${d}`));
      ids = next;
    }
    index[3000] = ids.map((p) => edge(p, 'leaf'));
    const r = new EdgeResolver(reader(index).read, new Set([1000, 3000]), { maxDepth: 64, maxEdgesPerObject: 256, maxReads: 1_000_000 });
    expect(r.resolve(3000)).toBe(USAGE_INCOMPLETE);
  });

  test('exceeding the depth budget reports incomplete', () => {
    const index: Index = {};
    for (let n = 1; n <= 40; n++) index[n] = [edge(n + 1, 'p')];
    index[41] = [edge(0, 'Root')];
    const r = new EdgeResolver(reader(index).read, new Set([0]), { maxDepth: 16, maxEdgesPerObject: 256, maxReads: 1_000_000 });
    expect(r.resolve(1)).toBe(USAGE_INCOMPLETE);
    const deep = new EdgeResolver(reader(index).read, new Set([0]), { maxDepth: 64, maxEdgesPerObject: 256, maxReads: 1_000_000 });
    // `via` runs from the anchor's side down to the object: 41, 40, ..., 2.
    expect(deep.resolve(1)).toEqual([{ parent: 0, label: `Root/${'p/'.repeat(39)}p`, via: Array.from({ length: 40 }, (_, i) => 41 - i) }]);
  });

  test('exhausting the read budget makes every later resolution incomplete', () => {
    const index: Index = { 5: [edge(6, 'a')], 6: [edge(0, 'b')], 7: [edge(0, 'c')] };
    const r = new EdgeResolver(reader(index).read, new Set([0]), { maxDepth: 16, maxEdgesPerObject: 256, maxReads: 1 });
    expect(r.resolve(5)).toBe(USAGE_INCOMPLETE);
    expect(r.resolve(7)).toBe(USAGE_INCOMPLETE);
  });

  test('a cycle among unchanged objects contributes no anchors and does not poison the memo', () => {
    // 10 <-> 11 reference each other; 11 is also referenced from the page (anchor 3); 12 is under 10.
    const index: Index = { 12: [edge(10, 'x')], 10: [edge(11, 'y')], 11: [edge(10, 'z'), edge(3, 'Annots/[0]')] };
    const { read } = reader(index);
    const r = new EdgeResolver(read, new Set([3, 12]));
    expect(r.resolve(12)).toEqual([{ parent: 3, label: 'Annots/[0]/y/x', via: [11, 10] }]);
    // Resolving 11 afresh must not reuse a result computed while 10 was on the active chain.
    expect(r.resolve(11)).toEqual([{ parent: 3, label: 'Annots/[0]' }]);
  });
});
