import { describe, expect, test } from 'vitest';
import type { Annotation, AnnotationPatch } from '../../src/annotation/kinds';
import { pdfAnnotationOf, pdfAnnotationPatchOf } from '../../src/pageSpace/annotations';
import { applyAnnotationPatch, resolveAnnotationPatch } from '../../src/pageSpace/helpers';
import { pdfResolveAnnotationPatch } from '../../src/validation';

const base = {
  ref: {
    kind: 'objectNumber',
    page: { kind: 'objectNumber', objectNumber: 3 },
    objectNumber: 9,
  },
  page: { kind: 'objectNumber', objectNumber: 3 },
  index: 0,
  hasAppearance: true,
  appearanceState: null,
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

  test('a patch the engine refuses without its schemas throws, as the engine does', () => {
    expect(() => applyAnnotationPatch(square, { subtype: 'line' } as never)).toThrow(
      expect.objectContaining({ code: 'InvalidArg' }),
    );
    expect(() => applyAnnotationPatch(square, { fontSize: 12 } as never)).toThrow(
      expect.objectContaining({ code: 'InvalidArg' }),
    );
  });

  test('predicts values the engine refuses, which the engine refuses at its door', () => {
    const patch = { color: 'red', strokeWidth: -1 } as unknown as AnnotationPatch;
    // The page predicts without the schemas: the change shows, and leaves when refused.
    expect(applyAnnotationPatch(square, patch)).toMatchObject({ color: 'red', strokeWidth: -1 });
    const page = { left: 0, bottom: 0, right: 600, top: 800 };
    expect(() =>
      pdfResolveAnnotationPatch(
        pdfAnnotationOf(square, page, () => page),
        pdfAnnotationPatchOf({ ...patch, subtype: 'square' } as AnnotationPatch, page, () => page),
      ),
    ).toThrow(expect.objectContaining({ code: 'InvalidArg', details: { field: 'color' } }));
  });

  test('a value only a read has, sent back unchanged, is dropped on the page as in the engine', () => {
    // Another app's beveled border: a read has it, a write can't make it.
    const beveled = { ...square, borderStyle: 'beveled' } as unknown as Annotation;
    const patch = { borderStyle: 'beveled', color: '#00ff00' } as unknown as AnnotationPatch;
    const page = { left: 0, bottom: 0, right: 600, top: 800 };
    expect(resolveAnnotationPatch(beveled, patch)).toEqual({ subtype: 'square', color: '#00ff00' });
    expect(
      pdfResolveAnnotationPatch(
        pdfAnnotationOf(beveled, page, () => page),
        pdfAnnotationPatchOf({ ...patch, subtype: 'square' } as AnnotationPatch, page, () => page),
      ),
    ).toEqual({ subtype: 'square', color: '#00ff00' });
  });
});

describe('a kind change', () => {
  const quad = {
    upperLeft: { x: 10, y: 20 },
    upperRight: { x: 60, y: 20 },
    lowerLeft: { x: 10, y: 32 },
    lowerRight: { x: 60, y: 32 },
  };
  const highlight = {
    ...base,
    subtype: 'highlight',
    rect: { x: 10, y: 20, width: 50, height: 12 },
    color: '#ffff00',
    opacity: 1,
    quadPoints: [quad],
  } as unknown as Annotation;
  // Half of a replace-text suggestion: grouped under its caret, with its intent.
  const replacement = {
    ...highlight,
    subtype: 'strikeout',
    color: '#ff0000',
    intent: 'strikeout-text-edit',
    reply: { to: { ...base.ref, objectNumber: 8 }, type: 'group' },
  } as unknown as Annotation;
  const page = { left: 0, bottom: 0, right: 600, top: 800 };

  test('a highlight becomes a squiggly line, the same annotation with every field kept', () => {
    expect(resolveAnnotationPatch(highlight, { subtype: 'squiggly' })).toEqual({
      subtype: 'squiggly',
    });
    const next = applyAnnotationPatch(highlight, { subtype: 'squiggly' });
    expect(next).toEqual({ ...highlight, subtype: 'squiggly' });
    expect(next.subtype === 'squiggly' && next.quadPoints).toBe(
      highlight.subtype === 'highlight' && highlight.quadPoints,
    );
  });

  test('other fields change with it, as the new kind takes them', () => {
    expect(
      applyAnnotationPatch(highlight, { subtype: 'underline', color: '#1d4ed8' }),
    ).toMatchObject({ subtype: 'underline', color: '#1d4ed8', opacity: 1 });
    expect(applyAnnotationPatch(square, { subtype: 'circle' })).toEqual({
      ...square,
      subtype: 'circle',
    });
  });

  test('a field only the new kind has reads null', () => {
    expect(applyAnnotationPatch(highlight, { subtype: 'strikeout' })).toMatchObject({
      subtype: 'strikeout',
      intent: null,
    });
  });

  test('a kind it can’t become is refused, naming the ones it can', () => {
    expect(() => applyAnnotationPatch(highlight, { subtype: 'ink' } as never)).toThrow(
      expect.objectContaining({
        code: 'InvalidArg',
        message: 'highlight can become underline, squiggly or strikeout, not ink',
        details: { field: 'subtype' },
      }),
    );
    expect(() => applyAnnotationPatch(ink, { subtype: 'square' } as never)).toThrow(
      expect.objectContaining({ message: 'ink has no other kind it can become' }),
    );
  });

  test('a value the new kind can’t hold is refused, never dropped', () => {
    expect(() => applyAnnotationPatch(replacement, { subtype: 'highlight' })).toThrow(
      expect.objectContaining({
        code: 'InvalidArg',
        message:
          "strikeout field 'intent' holds 'strikeout-text-edit', and highlight has no such field: clear it first, in the same change",
        details: { field: 'intent' },
      }),
    );
    // The new kind's patch can't name it: it is the old kind's field.
    expect(() =>
      applyAnnotationPatch(replacement, { subtype: 'highlight', intent: null } as never),
    ).toThrow(expect.objectContaining({ code: 'InvalidArg' }));
    // Cleared first, as an earlier op of the same change does, it can.
    const cleared = applyAnnotationPatch(replacement, { intent: null });
    const next = applyAnnotationPatch(cleared, { subtype: 'highlight' });
    expect(next).toMatchObject({ subtype: 'highlight', reply: replacement.reply });
    expect(next).not.toHaveProperty('intent');
  });

  test('the engine checks the change against the new kind’s schema', () => {
    const write = (patch: AnnotationPatch) =>
      pdfResolveAnnotationPatch(
        pdfAnnotationOf(highlight, page, () => page),
        pdfAnnotationPatchOf(patch, page, () => page),
      );
    expect(write({ subtype: 'underline', color: '#1d4ed8' } as AnnotationPatch)).toEqual({
      subtype: 'underline',
      color: '#1d4ed8',
    });
    expect(() => write({ subtype: 'squiggly', opacity: 2 } as AnnotationPatch)).toThrow(
      expect.objectContaining({ code: 'InvalidArg', details: { field: 'opacity' } }),
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

  test('a border made dashed with its pattern left out states the default; null is none', () => {
    expect(applyAnnotationPatch(square, { borderStyle: 'dashed' })).toMatchObject({
      borderStyle: 'dashed',
      dashArray: [3, 3],
    });
    const patterned = {
      ...square,
      borderStyle: 'dashed',
      dashArray: [6, 2],
    } as unknown as Annotation;
    expect(applyAnnotationPatch(patterned, { dashArray: null })).toMatchObject({
      dashArray: null,
    });
    // On a border with no pattern, null changes nothing: the patch makes it
    // dashed, as one that leaves the pattern out does.
    expect(applyAnnotationPatch(square, { borderStyle: 'dashed', dashArray: null })).toMatchObject({
      borderStyle: 'dashed',
      dashArray: [3, 3],
    });
    // A pattern stored on a solid border is kept and draws once it is dashed.
    const kept = { ...square, dashArray: [6, 2] } as unknown as Annotation;
    expect(applyAnnotationPatch(kept, { borderStyle: 'dashed' })).toMatchObject({
      dashArray: [6, 2],
    });
    // Back to solid, or another app's dashed border without /D left alone: nothing stated.
    expect(resolveAnnotationPatch(patterned, { borderStyle: 'solid' })).toEqual({
      subtype: 'square',
      borderStyle: 'solid',
    });
    const foreign = { ...square, borderStyle: 'dashed' } as unknown as Annotation;
    expect(resolveAnnotationPatch(foreign, { color: '#00ff00' })).toEqual({
      subtype: 'square',
      color: '#00ff00',
    });
  });

  test('an empty dash pattern is refused: a solid line is borderStyle solid', () => {
    const page = { left: 0, bottom: 0, right: 600, top: 800 };
    expect(() =>
      pdfResolveAnnotationPatch(
        pdfAnnotationOf(square, page, () => page),
        pdfAnnotationPatchOf(
          { subtype: 'square', borderStyle: 'dashed', dashArray: [] } as AnnotationPatch,
          page,
          () => page,
        ),
      ),
    ).toThrow(expect.objectContaining({ code: 'InvalidArg', details: { field: 'dashArray' } }));
  });
});
