/**
 * The frame a small annotation's handles stand out on is sized for the
 * pointer the chrome is drawn for: twice the grab size, which a touch doubles.
 */
import type { AnnotationRef } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { annotationHarness, PAGE, type FileAnnotation } from '../harness';

const CROP = { left: 0, bottom: 0, right: 600, top: 800 };
const REF: AnnotationRef = { kind: 'objectNumber', page: PAGE, objectNumber: 20 };

/** A 10 × 10 square; in page space its box is `{ x: 100, y: 100 }`. */
const smallSquare = {
  ref: REF,
  page: PAGE,
  index: 0,
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
  rect: { left: 100, bottom: 690, right: 110, top: 700 },
  box: { left: 100, bottom: 690, right: 110, top: 700 },
  color: '#000000',
  strokeWidth: 1,
  opacity: 1,
  interiorColor: null,
} as unknown as FileAnnotation;

/** The side of the dashed frame the square's handles stand out on, at 1 px per point. */
const frameSide = (harness: ReturnType<typeof annotationHarness>) => {
  const frame = harness.capability
    .listChromeNodes(PAGE, 1)
    .find((node) => node.kind === 'handle-frame');
  if (frame?.kind !== 'handle-frame') throw new Error('expected a handle frame');
  return frame.corners[1].x - frame.corners[0].x;
};

describe('the handle frame follows the pointer', () => {
  it('is twice the grab size for a mouse, and twice the touch grab size after a touch press', async () => {
    const harness = annotationHarness({ crop: CROP });
    await harness.load([smallSquare]);
    harness.commit({ type: 'select', ids: [harness.model().order[0]!] });
    const { capability } = harness;
    // The default grab zone is 24 px.
    expect(frameSide(harness)).toBeCloseTo(48, 6);

    const middle = { x: 105, y: 105 };
    capability.editPointer('down', PAGE, middle, false, 1, 0, 1, true);
    capability.editPointer('up', PAGE, middle, false, 1, 0, 1, true);
    expect(frameSide(harness)).toBeCloseTo(96, 6);

    capability.editPointer('down', PAGE, middle, false, 1, 0, 1, false);
    capability.editPointer('up', PAGE, middle, false, 1, 0, 1, false);
    expect(frameSide(harness)).toBeCloseTo(48, 6);
  });
});
