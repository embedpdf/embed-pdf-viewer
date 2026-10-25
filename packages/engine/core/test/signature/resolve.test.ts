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
    // The route from 11 to 10 is inside the loop: written `…`, entered at 11, left from 10.
    const index: Index = { 12: [edge(10, 'x')], 10: [edge(11, 'y')], 11: [edge(10, 'z'), edge(3, 'Annots/[0]')] };
    const { read } = reader(index);
    const r = new EdgeResolver(read, new Set([3, 12]));
    expect(r.resolve(12)).toEqual([{ parent: 3, label: 'Annots/[0]/…/x', via: [11, 10] }]);
    // Resolving 11 afresh must not reuse a result computed while 10 was on the active chain.
    expect(r.resolve(11)).toEqual([{ parent: 3, label: 'Annots/[0]' }]);
  });
});

/**
 * A structure tree as Chrome and Word write it: the root (10) under the
 * catalog (1), elements pointing at their parent (/P) and children (/K),
 * every element pointing at the page (3, changed) with /Pg, and a parent
 * tree (11, array 12) pointing back at the leaves. One loop.
 */
function structureTree(sections: number, perSection: number): Index {
  const index: Index = { 10: [edge(1, 'StructTreeRoot')], 11: [edge(10, 'ParentTree')], 12: [edge(11, 'Nums/[1]')] };
  const page: ObjectReferrer[] = [edge(2, 'Kids/[0]')];
  const document = 20;
  index[document] = [edge(10, 'K')];
  page.push(edge(document, 'Pg'));
  let next = 100;
  let leaf = 0;
  for (let s = 0; s < sections; s++) {
    const section = next++;
    index[section] = [edge(document, `K/[${s}]`)];
    index[document].push(edge(section, 'P'));
    page.push(edge(section, 'Pg'));
    for (let p = 0; p < perSection; p++) {
      const paragraph = next++;
      index[paragraph] = [edge(section, `K/[${p}]`), edge(12, `[${leaf++}]`)];
      index[section].push(edge(paragraph, 'P'));
      page.push(edge(paragraph, 'Pg'), edge(paragraph, 'K/[0]/Pg'));
    }
  }
  index[10].push(edge(document, 'P'));
  index[3] = page;
  return index;
}

describe('EdgeResolver: loops of unchanged objects', () => {
  test('a page under a structure tree resolves in one read per object, the routes inside the tree collapsed', () => {
    const index = structureTree(40, 40);
    const objects = Object.keys(index).length;
    const { read, reads } = reader(index);
    // Anchors: catalog, page tree root, the page.
    const r = new EdgeResolver(read, new Set([1, 2, 3]));
    const out = r.resolve(3);
    expect(out).not.toBe(USAGE_INCOMPLETE);
    expect(reads()).toBe(objects);
    expect((out as ObjectReferrer[]).map((e) => `${e.parent}:${e.label}`)).toEqual([
      '2:Kids/[0]',
      '1:StructTreeRoot/…/Pg',
      '1:StructTreeRoot/…/K/[0]/Pg',
    ]);
    // The way in (the root) and the way out (an element) are named.
    expect((out as ObjectReferrer[])[1]).toEqual({ parent: 1, label: 'StructTreeRoot/…/Pg', via: [10, 20] });
  });

  test('every way into a loop is kept: a changed object pointing into it is never absorbed by the route', () => {
    const index = structureTree(3, 3);
    // Object 90 (changed, so an anchor) points at a paragraph inside the tree.
    index[101].push(edge(90, 'Extra'));
    const r = new EdgeResolver(reader(index).read, new Set([1, 2, 3, 90]));
    const keys = (r.resolve(3) as ObjectReferrer[]).map((e) => `${e.parent}:${e.label}`);
    expect(keys).toContain('1:StructTreeRoot/…/Pg');
    expect(keys).toContain('90:Extra/…/Pg');
    // At the paragraph it enters, the edge is exact; it leaves from there too.
    expect(keys).toContain('90:Extra/Pg');
  });

  test('a member is reached exactly through the edge that enters at it, and through the loop by every other one', () => {
    // A two-member loop 10 <-> 11, entered at 10 from anchor 1 and at 11 from anchor 2.
    const index: Index = { 10: [edge(11, 'b'), edge(1, 'x')], 11: [edge(10, 'a'), edge(2, 'y')] };
    const r = new EdgeResolver(reader(index).read, new Set([1, 2]));
    expect(r.resolve(10)).toEqual([
      { parent: 1, label: 'x' },
      { parent: 2, label: 'y/…', via: [11] },
    ]);
    // No route back to the member it entered at.
    expect(r.resolve(11)).toEqual([
      { parent: 2, label: 'y' },
      { parent: 1, label: 'x/…', via: [10] },
    ]);
  });

  test('a route entering a loop at two members reaches each one through the other', () => {
    // Loop D (20 -> 21 -> 22 -> 20) is entered at 20 from anchor 1 and leaves
    // from 21 and 22 by the same key into loop C (10 -> 11 -> 12 -> 10), so
    // one collapsed route enters C at 10 and at 11. Object 5 hangs off 10.
    const index: Index = {
      20: [edge(1, 'a'), edge(22, 'n')],
      21: [edge(20, 'n')],
      22: [edge(21, 'n')],
      10: [edge(21, 'k'), edge(12, 'm')],
      11: [edge(22, 'k'), edge(10, 'm')],
      12: [edge(11, 'm')],
      5: [edge(10, 'x')],
    };
    const r = new EdgeResolver(reader(index).read, new Set([1, 5]));
    expect(r.resolve(5)).toEqual([
      { parent: 1, label: 'a/…/k/x', via: [20, 21, 10] },
      { parent: 1, label: 'a/…/k/…/x', via: [20, 22, 11, 10] },
    ]);
  });

  test('a long doubly linked list (an outline) resolves within the default budget', () => {
    // Outline root 10 under the catalog; items 100.. linked by /Next and /Prev,
    // each with /Parent, each pointing at the page (3) with Dest/[0].
    const items = 500;
    const index: Index = { 10: [edge(1, 'Outlines')], 3: [edge(2, 'Kids/[0]')] };
    for (let i = 0; i < items; i++) {
      const n = 100 + i;
      index[n] = [];
      if (i === 0) index[n].push(edge(10, 'First'));
      if (i === items - 1) index[n].push(edge(10, 'Last'));
      if (i > 0) index[n].push(edge(n - 1, 'Next'));
      if (i < items - 1) index[n].push(edge(n + 1, 'Prev'));
      index[10].push(edge(n, 'Parent'));
      index[3].push(edge(n, 'Dest/[0]'));
    }
    const r = new EdgeResolver(reader(index).read, new Set([1, 2, 3]));
    expect(r.resolve(3)).toEqual([
      { parent: 2, label: 'Kids/[0]' },
      { parent: 1, label: 'Outlines/…/Dest/[0]', via: [10, 100] },
    ]);
  });

  test('a loop larger than the read budget is incomplete', () => {
    const index = structureTree(10, 10);
    const r = new EdgeResolver(reader(index).read, new Set([1, 2, 3]), { maxDepth: 16, maxEdgesPerObject: 256, maxReads: 50 });
    expect(r.resolve(3)).toBe(USAGE_INCOMPLETE);
  });

  test('more distinct ways into a loop than the edge budget is incomplete', () => {
    // 300 anchors each point into a two-member loop under the page.
    const index: Index = { 10: [edge(11, 'b')], 11: [edge(10, 'a')], 3: [edge(10, 'Pg')] };
    for (let i = 0; i < 300; i++) index[11].push(edge(1000 + i, 'Ref'));
    const anchors = new Set([3, ...Array.from({ length: 300 }, (_, i) => 1000 + i)]);
    const r = new EdgeResolver(reader(index).read, anchors);
    expect(r.resolve(3)).toBe(USAGE_INCOMPLETE);
  });

  test('a chain above a loop counts toward the depth budget', () => {
    // anchor 0 -> chain 50..69 -> loop 10 <-> 11 -> changed object 5.
    const index: Index = { 5: [edge(10, 'x')], 10: [edge(11, 'b')], 11: [edge(10, 'a'), edge(69, 'c')] };
    for (let n = 50; n < 69; n++) index[n + 1] = [edge(n, 'p')];
    index[50] = [edge(0, 'Root')];
    const shallow = new EdgeResolver(reader(index).read, new Set([0, 5]));
    expect(shallow.resolve(5)).toBe(USAGE_INCOMPLETE);
    const deep = new EdgeResolver(reader(index).read, new Set([0, 5]), { maxDepth: 64, maxEdgesPerObject: 256, maxReads: 1_000 });
    expect(deep.resolve(5)).toEqual([
      { parent: 0, label: `Root/${'p/'.repeat(19)}c/…/x`, via: [...Array.from({ length: 20 }, (_, i) => 50 + i), 11, 10] },
    ]);
  });
});
