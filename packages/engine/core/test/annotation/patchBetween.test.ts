import { describe, expect, test } from 'vitest';
import type { AnnotationDTO } from '../../src/annotation/kinds';
import {
  annotationPatchBetween,
  mergeAnnotationPatch,
} from '../../src/annotation/resolve/patchBetween';

const square = {
  ref: {
    kind: 'objectNumber',
    page: { kind: 'objectNumber', pageObjectNumber: 3 },
    annotObjectNumber: 9,
  },
  page: { kind: 'objectNumber', pageObjectNumber: 3 },
  index: 0,
  identityQuality: 'durable',
  nm: 'shape',
  contents: null,
  subject: null,
  blendMode: 'normal',
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
  reply: null,
  popup: null,
  groupId: null,
  author: 'Ada',
  createdAt: null,
  modifiedAt: null,
  userId: null,
  createdBy: null,
  modifiedBy: null,
  importedBy: null,
  actions: null,
  subtype: 'square',
  rect: { x: 10, y: 20, width: 30, height: 40 },
  box: { x: 10, y: 20, width: 30, height: 40 },
  rotation: null,
  color: '#ff0000',
  opacity: 1,
  strokeWidth: 1,
  borderStyle: 'solid',
  dashArray: null,
  interiorColor: null,
  cloudyIntensity: null,
} as unknown as AnnotationDTO;

const box = (square as Extract<AnnotationDTO, { subtype: 'square' }>).box;

describe('annotationPatchBetween', () => {
  test('states each data field that changed, whole', () => {
    const after = { ...square, box: { ...box, x: 50 }, locked: true } as AnnotationDTO;
    expect(annotationPatchBetween(square, after)).toEqual({
      box: { x: 50, y: 20, width: 30, height: 40 },
      locked: true,
    });
  });

  test('a value rebuilt with the same content is no change', () => {
    const after = { ...square, box: { ...box }, dashArray: null } as AnnotationDTO;
    expect(annotationPatchBetween(square, after)).toEqual({});
  });

  test("leaves out what the engine works out, stamps or keeps: a drawn kind's rect, the dates", () => {
    const after = {
      ...square,
      rect: { x: 0, y: 0, width: 1, height: 1 },
      modifiedAt: '2026-09-29T00:00:00Z',
      index: 4,
    } as AnnotationDTO;
    expect(annotationPatchBetween(square, after)).toEqual({});
  });
});

describe('mergeAnnotationPatch', () => {
  test('sets the fields as given, and no field follows another', () => {
    const merged = mergeAnnotationPatch(square, { subtype: 'square', box: { ...box, x: 50 } });
    expect((merged as { box: unknown }).box).toEqual({ x: 50, y: 20, width: 30, height: 40 });
    // The engine works the rect out from the box when it writes it.
    expect(merged.rect).toBe(square.rect);
  });

  test('round-trips with annotationPatchBetween', () => {
    const patch = { subtype: 'square' as const, color: '#00ff00', rotation: 30 };
    const merged = mergeAnnotationPatch(square, patch);
    expect(annotationPatchBetween(square, merged)).toEqual({ color: '#00ff00', rotation: 30 });
  });
});
