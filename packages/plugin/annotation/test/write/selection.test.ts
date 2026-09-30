/**
 * `selectInRect` selects what the marquee selects: what the rect touches of
 * what each annotation paints, with the rest of each one's group.
 */
import { selectionInBox } from '@embedpdf/core-annotation';
import { annotationKey, type AnnotationRef } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { annotationHarness, PAGE, type FileAnnotation } from '../harness';

const CROP = { left: 0, bottom: 0, right: 600, top: 800 };
const refOf = (objectNumber: number): AnnotationRef => ({
  kind: 'objectNumber',
  page: PAGE,
  objectNumber,
});

/** An unfilled square; in page space its box is `{ x, y: 100, width: 100, height: 60 }`. */
const square = (objectNumber: number, x: number, extra: Record<string, unknown> = {}) =>
  ({
    ref: refOf(objectNumber),
    page: PAGE,
    index: objectNumber,
    identityQuality: 'durable',
    hasAppearance: true,
    nm: null,
    invisible: false,
    hidden: false,
    print: true,
    noZoom: false,
    noRotate: false,
    noView: false,
    readOnly: false,
    locked: false,
    toggleNoView: false,
    lockedContents: false,
    contents: null,
    subject: null,
    author: null,
    createdAt: null,
    modifiedAt: null,
    blendMode: 'normal',
    subtype: 'square',
    rect: { left: x, bottom: 640, right: x + 100, top: 700 },
    box: { left: x, bottom: 640, right: x + 100, top: 700 },
    color: '#000000',
    strokeWidth: 2,
    opacity: 1,
    interiorColor: null,
    ...extra,
  }) as unknown as FileAnnotation;

describe('selectInRect', () => {
  it('selects what the rect touches of what each annotation paints, groups included, as the marquee does', async () => {
    const harness = annotationHarness({ crop: CROP });
    await harness.load([
      square(10, 100),
      square(11, 300, { reply: { to: refOf(10), type: 'group' } }),
    ]);
    const { capability } = harness;
    const selectedKeys = () => new Set(capability.getSelection().map(annotationKey));

    // The empty middle of the unfilled square: nothing.
    const middle = { x: 130, y: 120, width: 40, height: 20 };
    capability.selectInRect(PAGE, middle);
    expect(selectedKeys()).toEqual(new Set());

    // Its border: it, and the other member of its group.
    const border = { x: 90, y: 120, width: 15, height: 20 };
    capability.selectInRect(PAGE, border);
    expect(selectedKeys()).toEqual(new Set([annotationKey(refOf(10)), annotationKey(refOf(11))]));
    expect(selectedKeys()).toEqual(new Set(selectionInBox(harness.model(), PAGE, border)));
  });
});
