import { describe, expect, test } from 'vitest';
import type { Annotation } from '../../src/annotation/kinds';
import { applyAnnotationPatch, resolveAnnotationPatch } from '../../src/pageSpace/helpers';

const base = {
  ref: {
    kind: 'objectNumber',
    page: { kind: 'objectNumber', objectNumber: 3 },
    objectNumber: 9,
  },
  page: { kind: 'objectNumber', objectNumber: 3 },
  index: 0,
  identityQuality: 'durable',
  hasAppearance: true,
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
};

const square = {
  ...base,
  subtype: 'square',
  rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
  box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
  rotation: null,
  color: '#ff0000',
  opacity: 1,
  strokeWidth: 1,
  borderStyle: 'solid',
  dashArray: null,
  interiorColor: null,
  cloudyIntensity: null,
} as unknown as Annotation;

const ink = {
  ...base,
  subtype: 'ink',
  rect: { x: 10, y: 10, width: 50, height: 50 },
  color: '#ff0000',
  opacity: 1,
  strokeWidth: 1,
  borderStyle: 'solid',
  dashArray: null,
  inkList: [
    [
      { x: 10.1, y: 20.2 },
      { x: 30.3, y: 40.4 },
    ],
  ],
  intent: null,
  rotation: null,
} as unknown as Annotation;

describe('applyAnnotationPatch', () => {
  test('a field the patch leaves alone keeps its very value', () => {
    const next = applyAnnotationPatch(ink, { color: '#00ff00' });
    expect(next.subtype === 'ink' && next.color).toBe('#00ff00');
    expect(next.subtype === 'ink' && next.inkList).toBe(ink.subtype === 'ink' && ink.inkList);
    expect(next.rect).toBe(ink.rect);
  });

  test('a value the patch gives comes back as given, not through the file and back', () => {
    const box = { x: 0.1, y: 0.2, width: 0.2, height: 0.30000000000000004 };
    const next = applyAnnotationPatch(square, { box });
    expect(next.subtype === 'square' && next.box).toBe(box);
  });

  test("fields the engine owns or stamps keep the read's value", () => {
    const next = applyAnnotationPatch(square, { color: '#0000ff', author: 'Grace' } as never);
    expect(next.author).toBe('Ada');
    // A drawn kind's rect is the engine's: it arrives with the engine's answer.
    expect(next.rect).toBe(square.rect);
  });

  test("a drawn kind's new rect moves its shape there", () => {
    const patch = resolveAnnotationPatch(square, {
      rect: { x: 10.1, y: 0.2, width: 0.3, height: 0.4 },
    });
    expect(patch).not.toHaveProperty('rect');
    expect(patch).toMatchObject({ subtype: 'square' });
    const next = applyAnnotationPatch(square, {
      rect: { x: 10.1, y: 0.2, width: 0.3, height: 0.4 },
    });
    expect(next.subtype === 'square' && next.box.x).toBeCloseTo(10.1, 9);
  });

  test('a patch the engine would refuse throws, as the engine does', () => {
    expect(() => applyAnnotationPatch(square, { subtype: 'circle' } as never)).toThrow(
      expect.objectContaining({ code: 'InvalidArg' }),
    );
    expect(() => applyAnnotationPatch(square, { fontSize: 12 } as never)).toThrow(
      expect.objectContaining({ code: 'InvalidArg' }),
    );
  });
});

describe('a callout line follows its box', () => {
  const callout = {
    ...base,
    subtype: 'free-text',
    rect: { x: 20, y: 100, width: 180, height: 50 },
    box: { x: 100, y: 100, width: 100, height: 50 },
    rotation: null,
    intent: 'free-text-callout',
    calloutLine: [
      { x: 20, y: 125 },
      { x: 100, y: 125 },
    ],
    lineEnding: 'open-arrow',
  } as unknown as Annotation;

  const lineOf = (annotation: Annotation) =>
    annotation.subtype === 'free-text' ? (annotation.calloutLine ?? []) : [];

  test('a moved box: the end moves to the middle of the side facing the tip', () => {
    const next = applyAnnotationPatch(callout, {
      box: { x: 140, y: 100, width: 100, height: 50 },
    });
    expect(lineOf(next)[0]).toEqual({ x: 20, y: 125 });
    expect(lineOf(next)[1]!.x).toBeCloseTo(140, 9);
    expect(lineOf(next)[1]!.y).toBeCloseTo(125, 9);
  });

  test('a tip below the box: the end is the bottom side, as the page shows it', () => {
    const next = applyAnnotationPatch(callout, { box: { x: 0, y: 0, width: 100, height: 50 } });
    expect(lineOf(next)[1]!.x).toBeCloseTo(50, 9);
    expect(lineOf(next)[1]!.y).toBeCloseTo(50, 9);
  });

  test('a turned box: the end is on the side the page shows facing the tip', () => {
    // Turned a quarter clockwise about its middle (150, 125), the box stands
    // 50 wide and 100 tall; the tip at the left meets its left side's middle.
    const next = applyAnnotationPatch(callout, { rotation: 90 });
    expect(lineOf(next)[1]!.x).toBeCloseTo(125, 9);
    expect(lineOf(next)[1]!.y).toBeCloseTo(125, 9);
  });

  test('a stated line is kept, and a patch that moves nothing keeps the end', () => {
    const stated = [
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ];
    const kept = applyAnnotationPatch(callout, {
      box: { x: 0, y: 0, width: 100, height: 50 },
      calloutLine: stated as never,
    });
    expect(lineOf(kept)).toBe(stated);
    const untouched = applyAnnotationPatch(callout, { opacity: 0.5 });
    expect(lineOf(untouched)).toBe(lineOf(callout));
  });
});
