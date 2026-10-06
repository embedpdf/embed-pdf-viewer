/**
 * Where a double-click opens a text box's text: on its box, never on a
 * callout's line or in the empty rest of its frame.
 */
import type { AnnotationRef } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { annotationHarness, PAGE, type FileAnnotation } from '../harness';

const CROP = { left: 0, bottom: 0, right: 600, top: 800 };
const REF: AnnotationRef = { kind: 'objectNumber', page: PAGE, objectNumber: 40 };

// In page space the box is {300,100,120,40}; the line runs from the tip
// (100,300) through the knee (200,200) to the box's left side (300,120).
const callout = {
  ref: REF,
  page: PAGE,
  index: 0,
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
  contents: 'Look here',
  subject: null,
  author: null,
  createdAt: null,
  modifiedAt: null,
  blendMode: 'normal',
  subtype: 'free-text',
  intent: 'free-text-callout',
  fontFamily: 'helvetica',
  fontSize: 12,
  textAlign: 'left',
  color: '#000000',
  interiorColor: null,
  opacity: 1,
  strokeWidth: 1,
  borderStyle: 'solid',
  rect: { left: 95, bottom: 495, right: 420, top: 700 },
  box: { left: 300, bottom: 660, right: 420, top: 700 },
  calloutLine: [
    { x: 100, y: 500 },
    { x: 200, y: 600 },
    { x: 300, y: 680 },
  ],
  lineEnding: 'open-arrow',
} as unknown as FileAnnotation;

const ON_LINE = { x: 150, y: 250 };
const EMPTY_IN_FRAME = { x: 380, y: 280 };
const IN_BOX = { x: 360, y: 120 };

describe('double-click to edit text', () => {
  it("opens a callout's text on its box, never on its line or the empty rest of its frame", async () => {
    const harness = annotationHarness({ crop: CROP });
    await harness.load([callout]);
    const id = harness.model().order[0]!;
    const { capability } = harness;

    expect(capability.beginTextEditAt(PAGE, ON_LINE)).toBe(false);
    // Selected, the callout is grabbed anywhere in its frame, but its text
    // still opens only on its box.
    harness.commit({ type: 'select', ids: [id] });
    expect(capability.beginTextEditAt(PAGE, EMPTY_IN_FRAME)).toBe(false);
    expect(capability.beginTextEditAt(PAGE, ON_LINE)).toBe(false);
    expect(harness.model().editing).toBeNull();

    expect(capability.beginTextEditAt(PAGE, IN_BOX)).toBe(true);
    expect(harness.model().editing).toBe(id);
  });
});
