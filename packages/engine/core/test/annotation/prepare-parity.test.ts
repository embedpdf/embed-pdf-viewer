/**
 * The page and the engine write the same thing. Both prepare a write and derive what follows
 * from it with the same code; the engine's schema check between the two only accepts or
 * refuses. So for every write the engine takes, its result is the page's prediction, and a
 * write it refuses is one the page predicts without schema validation.
 */
import { describe, expect, test } from 'vitest';

import type { Annotation, AnnotationDraft, AnnotationPatch } from '../../src/annotation/kinds';
import { annotationOfResolvedDraft } from '../../src/annotation/resolve/annotationOfDraft';
import { pdfPredictAnnotationDraft } from '../../src/annotation/resolve/resolveAnnotationDraft';
import { pdfPredictAnnotationPatch } from '../../src/annotation/resolve/resolveAnnotationPatch';
import type { PdfRect } from '../../src/geometry/primitives';
import { measureFromKnownLength } from '../../src/measure';
import type { PdfCoordinates } from '../../src/pageSpace/coordinates';
import { pdfResolveAnnotationDraft, pdfResolveAnnotationPatch } from '../../src/validation';

type Read = Annotation<PdfCoordinates>;
type Draft = AnnotationDraft<PdfCoordinates>;
type Patch = AnnotationPatch<PdfCoordinates>;

const page = { kind: 'objectNumber', objectNumber: 3 } as const;
const ref = { kind: 'objectNumber', page, objectNumber: 41 } as const;
const box: PdfRect = { left: 100, bottom: 100, right: 220, top: 180 };
const vertices = [
  { x: 100, y: 100 },
  { x: 200, y: 100 },
  { x: 200, y: 180 },
];

/** The annotation `draft` creates, as the engine reads it back. */
const readOf = (draft: object, extra: object = {}): Read =>
  ({
    ...annotationOfResolvedDraft(pdfResolveAnnotationDraft(draft as Draft), { ref, rect: box }),
    ...extra,
  }) as Read;

/** A measured area whose caption another app placed and wrote. */
const polygon = readOf(
  {
    subtype: 'polygon',
    intent: 'polygon-dimension',
    vertices,
    measure: measureFromKnownLength(100, { value: 1, unit: 'm' }),
    color: '#ff0000',
    captionEnabled: true,
    captionCenter: { x: 160, y: 120 },
  },
  { contents: 'Lot 4' },
);
const square = readOf({ subtype: 'square', box, color: '#ff0000', borderStyle: 'solid' });
const beveled = { ...square, borderStyle: 'beveled' } as Read;
const moved = (by: number): PdfRect => ({
  left: square.rect.left + by,
  bottom: square.rect.bottom,
  right: square.rect.right + by,
  top: square.rect.top,
});

const accepted: Array<[string, Read, object, object]> = [
  [
    'a measured area resending its unchanged vertices with a new color keeps its caption',
    polygon,
    { vertices: vertices.map((point) => ({ ...point })), color: '#0000ff' },
    { subtype: 'polygon', color: '#0000ff' },
  ],
  [
    'a color sent back as it reads is dropped',
    square,
    { color: '#FF0000', opacity: 0.5 },
    { subtype: 'square', opacity: 0.5 },
  ],
  [
    'an unchanged readBack() value a write can make is dropped',
    square,
    { borderStyle: 'solid', strokeWidth: 3 },
    { subtype: 'square', strokeWidth: 3 },
  ],
  [
    'an unchanged readBack() value only a read has is dropped',
    beveled,
    { borderStyle: 'beveled', strokeWidth: 3 },
    { subtype: 'square', strokeWidth: 3 },
  ],
  [
    'the rect the engine works out, sent back unchanged, is dropped',
    square,
    { rect: { ...square.rect }, opacity: 0.5 },
    { subtype: 'square', opacity: 0.5 },
  ],
  [
    'any field sent back as it reads is dropped',
    square,
    { contents: null, hidden: false, nm: square.nm, opacity: 0.5 },
    { subtype: 'square', opacity: 0.5 },
  ],
];

describe('a patch the engine takes: the page predicts what the engine writes', () => {
  test.each(accepted)('%s', (_name, current, patch, expected) => {
    const predicted = pdfPredictAnnotationPatch(current, patch as Patch);
    expect(pdfResolveAnnotationPatch(current, patch as Patch)).toEqual(predicted);
    expect(predicted).toEqual(expected);
  });

  test('a new rect on a drawn kind becomes the same shape on both sides', () => {
    const patch = { rect: moved(30) } as Patch;
    const predicted = pdfPredictAnnotationPatch(square, patch);
    expect(pdfResolveAnnotationPatch(square, patch)).toEqual(predicted);
    expect(predicted).toMatchObject({ subtype: 'square', box: { left: 130, right: 250 } });
  });

  test('changed vertices change the measurement on both sides', () => {
    const patch = { vertices: vertices.map(({ x, y }) => ({ x: x + 10, y })) } as Patch;
    const predicted = pdfPredictAnnotationPatch(polygon, patch);
    expect(pdfResolveAnnotationPatch(polygon, patch)).toEqual(predicted);
    expect(predicted).toMatchObject({ captionCenter: { x: 170, y: 120 } });
    expect((predicted as { contents?: string }).contents).not.toBe('Lot 4');
  });
});

describe('a patch the engine refuses: the page predicts it without schema validation', () => {
  test.each([
    [
      'a changed readBack() value a write cannot make',
      square,
      { borderStyle: 'inset' },
      'borderStyle',
    ],
    ['a value outside its schema', square, { color: 'red' }, 'color'],
  ] as const)('%s', (_name, current, patch, field) => {
    expect(pdfPredictAnnotationPatch(current, patch as Patch)).toEqual({
      subtype: 'square',
      ...patch,
    });
    expect(() => pdfResolveAnnotationPatch(current, patch as Patch)).toThrow(
      expect.objectContaining({ code: 'InvalidArg', details: { field } }),
    );
  });
});

describe('a draft: the page predicts what the engine writes', () => {
  test.each([
    [
      'a box kind placed by its rect at a quarter turn',
      { subtype: 'square', rect: box, rotation: 90 },
    ],
    [
      'a measured area, labelled',
      {
        subtype: 'polygon',
        intent: 'polygon-dimension',
        vertices,
        measure: measureFromKnownLength(100, { value: 1, unit: 'm' }),
      },
    ],
    [
      'a free text, its rich text stated',
      { subtype: 'free-text', box, contents: 'Hi', fontSize: 14 },
    ],
    ['a note in a standard review state', { subtype: 'text', rect: box, state: 'accepted' }],
  ])('%s', (_name, draft) => {
    expect(pdfResolveAnnotationDraft(draft as Draft)).toEqual(
      pdfPredictAnnotationDraft(draft as Draft),
    );
  });

  test('one the engine refuses is predicted without schema validation', () => {
    const draft = { subtype: 'square', box, opacity: 2 } as unknown as Draft;
    expect(pdfPredictAnnotationDraft(draft)).toMatchObject({ opacity: 2 });
    expect(() => pdfResolveAnnotationDraft(draft)).toThrow(
      expect.objectContaining({ code: 'InvalidArg', details: { field: 'opacity' } }),
    );
  });
});
