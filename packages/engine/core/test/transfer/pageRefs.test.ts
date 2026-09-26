import { describe, expect, test } from 'vitest';
import type { AnnotationRef } from '../../src/identity/AnnotationRef';
import { toPageRef } from '../../src/identity/PageRef';
import { mapPageRefs, pageRefsIn } from '../../src/transfer/pageRefs';

const first = toPageRef(3);
const second = toPageRef(7);
const link = {
  ref: { kind: 'objectNumber', page: first, annotObjectNumber: 10 } as AnnotationRef,
  target: { kind: 'goto', destination: { kind: 'fit', page: second } },
  rect: { left: 0, bottom: 0, right: 1, top: 1 },
};

describe('pageRefsIn', () => {
  test('finds every page ref an item names, and nothing else', () => {
    expect(pageRefsIn(link)).toEqual([first, second]);
  });
});

describe('mapPageRefs', () => {
  test('replaces every page ref and copies the rest', () => {
    const mapped = mapPageRefs(link, (page) => toPageRef(page.pageObjectNumber + 100));
    expect(mapped).toEqual({
      ...link,
      ref: { ...link.ref, page: toPageRef(103) },
      target: { kind: 'goto', destination: { kind: 'fit', page: toPageRef(107) } },
    });
    expect(link.target.destination.page).toBe(second);
  });
});
