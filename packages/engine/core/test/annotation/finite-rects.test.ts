/**
 * A rect with `Infinity` or `NaN` in it places nothing: one rule, refused in each place a write
 * passes. On the page by the plain check (`isFinitePdfRect`), in the engine by its schemas
 * (`PdfRectSchema`), on the wire by the request schemas (`PageBoxSchema`). The engine's own
 * door is tested in `packages/engine/main/test/annotation-write-checks.test.ts`.
 */
import { describe, expect, test } from 'vitest';

import type { Annotation, AnnotationDraft, AnnotationPatch } from '../../src/annotation/kinds';
import { isFinitePdfRect } from '../../src/geometry/convert';
import { PageBoxSchema, PdfRectSchema } from '../../src/geometry/schemas';
import type { PdfCoordinates } from '../../src/pageSpace/coordinates';
import { annotationOfDraft, resolveRectCommand } from '../../src/pageSpace/helpers';
import { pdfResolveAnnotationDraft, pdfResolveAnnotationPatch } from '../../src/validation';
import { AnnotationDraftSchema, AnnotationPatchSchema } from '../../src/wire';

const page = { kind: 'objectNumber', objectNumber: 3 } as const;
const ref = { kind: 'objectNumber', page, objectNumber: 41 } as const;
const NOT_FINITE = [Infinity, -Infinity, NaN];
const refused = expect.objectContaining({ code: 'InvalidArg', details: { field: 'rect' } });

/** A square in page space, as a viewer reads it. */
const square = {
  subtype: 'square',
  rect: { x: 100, y: 100, width: 100, height: 60 },
  box: { x: 100, y: 100, width: 100, height: 60 },
  rotation: null,
  color: '#ff0000',
} as unknown as Annotation;

/** A note in the file's coordinates, whose `rect` is its own to write. */
const note = {
  subtype: 'text',
  ref,
  page,
  nm: 'note',
  rect: { left: 10, bottom: 10, right: 30, top: 30 },
  contents: null,
} as unknown as Annotation<PdfCoordinates>;

describe.each(NOT_FINITE)('a rect with %s in it', (edge) => {
  test('is not a rect to the plain check', () => {
    expect(isFinitePdfRect({ left: 0, bottom: 0, right: edge, top: 10 })).toBe(false);
    expect(isFinitePdfRect({ left: 0, bottom: 0, right: 10, top: 10 })).toBe(true);
  });

  test('is refused on the page: a drawn kind moved there, a box kind placed by it', () => {
    expect(() =>
      resolveRectCommand(square, { rect: { x: 100, y: edge, width: 100, height: 60 } } as never),
    ).toThrow(refused);
    expect(() =>
      annotationOfDraft(
        { subtype: 'square', rect: { x: edge, y: 0, width: 10, height: 10 } } as AnnotationDraft,
        { ref },
      ),
    ).toThrow(refused);
  });

  test('is refused by the engine, on create and on update', () => {
    const rect = { left: 10, bottom: 10, right: edge, top: 30 };
    expect(() =>
      pdfResolveAnnotationDraft({ subtype: 'text', rect } as AnnotationDraft<PdfCoordinates>),
    ).toThrow(expect.objectContaining({ code: 'InvalidArg' }));
    expect(() =>
      pdfResolveAnnotationPatch(note, { rect } as AnnotationPatch<PdfCoordinates>),
    ).toThrow(expect.objectContaining({ code: 'InvalidArg' }));
    expect(PdfRectSchema.safeParse(rect).success).toBe(false);
  });

  test('is refused on the wire', () => {
    const rect = { x: 10, y: edge, width: 20, height: 20 };
    expect(PageBoxSchema.safeParse(rect).success).toBe(false);
    expect(AnnotationDraftSchema.safeParse({ subtype: 'text', rect }).success).toBe(false);
    expect(AnnotationPatchSchema.safeParse({ subtype: 'text', rect }).success).toBe(false);
    expect(AnnotationDraftSchema.safeParse({ subtype: 'text', rect: { ...rect, y: 10 } })).toEqual(
      expect.objectContaining({ success: true }),
    );
  });
});
