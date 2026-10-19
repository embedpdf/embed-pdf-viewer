import { reload } from '@embedpdf/core';
import {
  toOutlineItemRef,
  toPageRef,
  type DocumentEvent,
  type EventOrigin,
  type OutlineItem,
  type OutlineItemRef,
} from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { itemsOf, treeOf, type OutlineTree } from '../../src/model';
import { foldOutline, predictOutline, undoOf } from '../../src/sync/tree';

const ref = toOutlineItemRef;
const A = ref(6);
const B = ref(7);
const C = ref(8);
const A1 = ref(10);
const C1 = ref(11);
const PAGE_TWO = toPageRef(4);

const item = (
  at: OutlineItemRef,
  title: string,
  parent: OutlineItemRef | null,
  extra: Partial<OutlineItem> = {},
): OutlineItem => ({
  ref: at,
  parent,
  title,
  target: null,
  action: null,
  open: false,
  color: null,
  bold: false,
  italic: false,
  ...extra,
});

/** A (open) with A1; B; C (closed) with C1. */
const OUTLINE = treeOf({
  items: [
    item(A, 'A', null, { open: true }),
    item(A1, 'A1', A),
    item(B, 'B', null),
    item(C, 'C', null),
    item(C1, 'C1', C),
  ],
  incomplete: false,
});

const titles = (tree: OutlineTree | null) => (tree ? itemsOf(tree).map((each) => each.title) : []);
const origin: EventOrigin = { kind: 'remote', sessionId: 'them', sub: null, ts: 0, serverId: null };
const meta = { affectedPages: [], cacheDelta: null, opId: 'op', undoable: true, changed: [] };

describe('foldOutline', () => {
  it('applies a create with its parent order', () => {
    const created = ref(20);
    const next = foldOutline(OUTLINE, {
      type: 'outline.created',
      origin,
      item: item(created, 'New', A),
      order: { parent: A, children: [created, A1] },
      meta,
    }) as OutlineTree;
    expect(titles(next)).toEqual(['A', 'New', 'A1', 'B', 'C', 'C1']);
  });

  it('applies a move: the orders it names and the items’ parents, and a parent left empty closes', () => {
    const next = foldOutline(OUTLINE, {
      type: 'outline.moved',
      origin,
      orders: [
        { parent: A, children: [] },
        { parent: null, children: [A, B, C, A1] },
      ],
      meta: { ...meta, changed: [A1] },
    }) as OutlineTree;
    expect(titles(next)).toEqual(['A', 'B', 'C', 'C1', 'A1']);
    expect(next.items[String(A1.objectNumber)]!.parent).toBeNull();
    expect(next.items[String(A.objectNumber)]!.open).toBe(false);
  });

  it('applies a delete with the items under it', () => {
    const next = foldOutline(OUTLINE, {
      type: 'outline.deleted',
      origin,
      deleted: [C, C1],
      meta: { ...meta, changed: [C, C1] },
    }) as OutlineTree;
    expect(titles(next)).toEqual(['A', 'A1', 'B']);
    expect(next.items[String(C1.objectNumber)]).toBeUndefined();
  });

  it('applies a restore at its place', () => {
    const deleted = foldOutline(OUTLINE, {
      type: 'outline.deleted',
      origin,
      deleted: [C, C1],
      meta,
    }) as OutlineTree;
    const restored = foldOutline(deleted, {
      type: 'outline.restored',
      origin,
      items: [item(C, 'C', null), item(C1, 'C1', C)],
      order: { parent: null, children: [A, C, B] },
      meta,
    }) as OutlineTree;
    expect(titles(restored)).toEqual(['A', 'A1', 'C', 'C1', 'B']);
  });

  it('reads again after a page delete, and leaves other events alone', () => {
    const pagesDeleted = { type: 'pages.deleted', pages: [PAGE_TWO] } as unknown as DocumentEvent;
    expect(foldOutline(OUTLINE, pagesDeleted)).toEqual(reload());
    const other = { type: 'metadata.updated' } as unknown as DocumentEvent;
    expect(foldOutline(OUTLINE, other)).toBe(OUTLINE);
    expect(foldOutline(null, pagesDeleted)).toBeNull();
  });
});

describe('predictOutline', () => {
  it('shows a create at its place, and changes nothing once the tree holds it', () => {
    const op = {
      type: 'outline.create',
      parent: A,
      position: 'start',
      data: { title: 'New', color: '#FF0000' },
      objectNumber: 20,
    } as const;
    const next = predictOutline(OUTLINE, op)!;
    expect(titles(next)).toEqual(['A', 'New', 'A1', 'B', 'C', 'C1']);
    expect(next.items['20']).toMatchObject({ parent: A, color: '#ff0000', open: false });
    expect(predictOutline(next, op)).toBe(next);
  });

  it('leaves the tree as it is for an op the engine refuses', () => {
    expect(
      predictOutline(OUTLINE, {
        type: 'outline.create',
        parent: ref(99),
        data: { title: 'x' },
        objectNumber: 20,
      }),
    ).toBe(OUTLINE);
    expect(
      predictOutline(OUTLINE, { type: 'outline.move', refs: [A], parent: A1, position: 'end' }),
    ).toBe(OUTLINE);
    expect(
      predictOutline(OUTLINE, {
        type: 'outline.move',
        refs: [A, A1],
        parent: null,
        position: 'end',
      }),
    ).toBe(OUTLINE);
    expect(
      predictOutline(OUTLINE, {
        type: 'outline.move',
        refs: [A],
        parent: null,
        position: { after: C1 },
      }),
    ).toBe(OUTLINE);
  });

  it('moves items with the items under them, and is absolute', () => {
    const op = { type: 'outline.move', refs: [C], parent: A, position: { after: A1 } } as const;
    const next = predictOutline(OUTLINE, op)!;
    expect(titles(next)).toEqual(['A', 'A1', 'C', 'C1', 'B']);
    expect(next.items[String(C.objectNumber)]!.parent).toEqual(A);
    expect(predictOutline(next, op)).toBe(next);
  });

  it('opens only an item with children, as the engine does', () => {
    const leaf = predictOutline(OUTLINE, {
      type: 'outline.update',
      ref: B,
      patch: { open: true },
    })!;
    expect(leaf).toBe(OUTLINE);
    const parent = predictOutline(OUTLINE, {
      type: 'outline.update',
      ref: C,
      patch: { open: true, title: 'See' },
    })!;
    expect(parent.items[String(C.objectNumber)]).toMatchObject({ open: true, title: 'See' });
  });
});

describe('undoOf', () => {
  const replay = (tree: OutlineTree, ops: Parameters<typeof undoOf>[1]) => {
    const after = ops.reduce((current, op) => predictOutline(current, op)!, tree);
    return undoOf(tree, ops).reduce((current, op) => predictOutline(current, op)!, after);
  };

  it('undoes a create by deleting what it made', () => {
    const ops = [
      { type: 'outline.create', parent: null, data: { title: 'New' }, objectNumber: 20 },
    ] as const;
    expect(titles(replay(OUTLINE, ops))).toEqual(titles(OUTLINE));
  });

  it('draws a delete back with the items under it, each at its place', () => {
    const ops = [
      { type: 'outline.delete', ref: A },
      { type: 'outline.delete', ref: C },
    ] as const;
    const undone = replay(OUTLINE, ops);
    expect(titles(undone)).toEqual(titles(OUTLINE));
    expect(undone.items).toEqual(OUTLINE.items);
  });

  it('draws a move back, each item at its place', () => {
    const ops = [{ type: 'outline.move', refs: [C, A], parent: B, position: 'end' }] as const;
    const undone = replay(OUTLINE, ops);
    expect(titles(undone)).toEqual(titles(OUTLINE));
    expect(undone.items[String(A.objectNumber)]!.parent).toBeNull();
  });

  it('draws an update back with every field as it was', () => {
    const tree = treeOf({
      items: [
        item(A, 'A', null, {
          target: { kind: 'javascript' },
          action: { root: null, incomplete: false, warningFlags: 0, warnings: [] },
        }),
      ],
      incomplete: false,
    });
    const ops = [
      { type: 'outline.update', ref: A, patch: { title: 'Z', target: null, bold: true } },
    ] as const;
    expect(replay(tree, ops).items).toEqual(tree.items);
  });
});
