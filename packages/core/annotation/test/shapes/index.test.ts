import { quadFromRect } from '@embedpdf/core-geometry';
import {
  annotationOfDraft,
  annotationPatchBetween,
  mergeAnnotationPatch,
  toPageRef,
  type AnnotationDraft,
  type AnnotationPatch,
} from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { kindOf, shapeOf } from '../../src/record';
import { familyOf } from '../../src/shapes';

const PAGE = toPageRef(1);
const BOX = { x: 100, y: 200, width: 80, height: 40 };
const QUAD = quadFromRect(BOX);

/** The annotation the engine reads back after creating `draft`. */
const created = (draft: Record<string, unknown>) =>
  annotationOfDraft(draft as unknown as AnnotationDraft, {
    ref: { kind: 'objectNumber', page: PAGE, objectNumber: 1 },
    rect: BOX,
  });

/** One annotation of every kind the families read, and the shape kind each reads as. */
const ANNOTATIONS: Array<[string, Record<string, unknown>, string]> = [
  ['a turned square', { subtype: 'square', box: BOX, rotation: 30 }, 'box'],
  ['a circle', { subtype: 'circle', box: BOX }, 'box'],
  ['a note', { subtype: 'text', rect: BOX }, 'box'],
  ['a link', { subtype: 'link', rect: BOX, target: null }, 'box'],
  [
    'a line with endings',
    {
      subtype: 'line',
      linePoints: { start: { x: 10, y: 10 }, end: { x: 90, y: 40 } },
      lineEndings: { start: 'none', end: 'open-arrow' },
    },
    'line',
  ],
  [
    'a turned polygon',
    {
      subtype: 'polygon',
      vertices: [
        { x: 10, y: 10 },
        { x: 90, y: 10 },
        { x: 50, y: 60 },
      ],
      rotation: 45,
    },
    'poly',
  ],
  [
    'ink',
    {
      subtype: 'ink',
      inkList: [
        [
          { x: 0, y: 0 },
          { x: 20, y: 30 },
        ],
      ],
    },
    'ink',
  ],
  [
    'a callout',
    {
      subtype: 'free-text',
      intent: 'free-text-callout',
      box: BOX,
      calloutLine: [
        { x: 20, y: 20 },
        { x: 100, y: 220 },
      ],
      lineEnding: 'open-arrow',
      contents: 'hi',
    },
    'text-box',
  ],
  ['a caret', { subtype: 'caret', box: BOX, rotation: 90 }, 'caret'],
  ['a highlight', { subtype: 'highlight', rect: BOX, quadPoints: [QUAD] }, 'quads'],
  ['a redaction over text', { subtype: 'redact', rect: BOX, quadPoints: [QUAD] }, 'quads'],
  ['a redaction over an area', { subtype: 'redact', rect: BOX }, 'box'],
];

describe('the shape families', () => {
  it.each(ANNOTATIONS)('%s: read by its kind, written back unchanged', (_, draft, kind) => {
    const annotation = created(draft);
    const shape = shapeOf(annotation);
    expect(shape.kind).toBe(kind);
    expect(kindOf(annotation).family.read(annotation)).toEqual(shape);
    // The fields that state the shape, merged back, are no change at all.
    const written = familyOf(shape).write(shape, annotation.subtype);
    const merged = mergeAnnotationPatch(annotation, {
      ...written,
      subtype: annotation.subtype,
    } as AnnotationPatch);
    expect(annotationPatchBetween(annotation, merged)).toEqual({});
  });
});
