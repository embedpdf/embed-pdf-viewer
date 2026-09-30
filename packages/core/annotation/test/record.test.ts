import { annotationKey } from '@embedpdf/core';
import { quadFromRect } from '@embedpdf/core-geometry';
import type {
  AnnotationDTO,
  AnnotationFlags,
  AnnotationPatch,
  AnnotationRef,
  CalloutLine,
  PdfCoordinates,
  PdfLinkTarget,
  PdfRect,
} from '@embedpdf/engine-core/runtime';
import {
  annotationPatchBetween,
  applyAnnotationPatch,
  pageAnnotationOf,
  pdfAnnotationPatchOf,
  pdfPointTurned,
  pdfTurnOfUpright,
  toPageRef,
} from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { DRAWN_FLAGS } from '../src/flags';
import { KINDS, type FieldSpec } from '../src/kinds';
import { linkChildrenOf, linkOf } from '../src/links';
import { isAttachedLink } from '../src/plane';
import {
  fromDTO,
  groupOf,
  irtOf,
  kindOf,
  linkChildRects,
  shapeOf,
  styleOf,
  textOf,
  withShape,
} from '../src/record';
import { familyOf } from '../src/shapes';
import { drawnStrokesOf } from '../src/shapes/points';
import type { FieldValues, Message, Model, ModelAnnotation, Shape } from '../src/types';
import { update } from '../src/update';
import { answering, modelWith, recordOf } from './support';

const CROP: PdfRect = { left: 0, bottom: 0, right: 600, top: 800 };

/*
 * The fixtures are the file's values; the engine hands them out in page space
 * and takes this plugin's writes back into the file. These run each value
 * through that same codec, so a test states the file's numbers on both ends.
 */
const boxOf = () => CROP;
/** A read as the engine hands it out. */
const fromFile = (dto: AnnotationDTO<PdfCoordinates>): AnnotationDTO =>
  pageAnnotationOf(dto, CROP, boxOf);
/** A patch as the engine writes it to the file. */
const toFile = (
  patch: AnnotationPatch | null | undefined,
): AnnotationPatch<PdfCoordinates> | null =>
  patch ? pdfAnnotationPatchOf(patch, CROP, boxOf) : null;

/** A message's write to one record: its change set's patch, or `null` when it changed nothing. */
function writeOf(record: ModelAnnotation, message: Message): AnnotationPatch | null {
  const result = update(modelWith([record], { selected: [record.id] }), message);
  return result.change.patches[record.id] ?? null;
}

/** What a sidebar edit of `values` writes to a record, in the file's coordinates. */
const fieldsWrite = (record: ModelAnnotation, values: FieldValues) =>
  toFile(writeOf(record, { type: 'setFields', patches: { [record.id]: values } })) as Record<
    string,
    unknown
  > | null;

/** The fields that state `shape` on a record's annotation, in the file's coordinates. */
const shapeWrite = (record: ModelAnnotation, shape: Shape) =>
  toFile({
    ...familyOf(shape).write(shape, record.annotation.subtype),
    subtype: record.annotation.subtype,
  } as AnnotationPatch) as Record<string, unknown>;

const NO_FLAGS: AnnotationFlags = {
  invisible: false,
  hidden: false,
  print: false,
  noZoom: false,
  noRotate: false,
  noView: false,
  readOnly: false,
  locked: false,
  toggleNoView: false,
  lockedContents: false,
};

/** A minimal committed square DTO, with optional relationship fields. */
function squareDTO(
  objectNumber: number,
  reply: { to: AnnotationRef; type: 'reply' | 'group' } | null = null,
): AnnotationDTO<PdfCoordinates> {
  const ref: AnnotationRef = { kind: 'objectNumber', page: toPageRef(1), objectNumber };
  return {
    ref,
    page: toPageRef(1),
    index: 0,
    identityQuality: 'durable',
    nm: null,
    ...NO_FLAGS,
    rect: { left: 100, bottom: 100, right: 200, top: 200 },
    contents: null,
    author: null,
    createdAt: null,
    modifiedAt: null,
    blendMode: 'normal',
    reply,
    popup: null,
    groupId: null,
    userId: null,
    createdBy: null,
    modifiedBy: null,
    importedBy: null,
    actions: null,
    subtype: 'square',
    box: { left: 100, bottom: 100, right: 200, top: 200 },
    rotation: null,
    cloudyIntensity: null,
    color: '#000000',
    interiorColor: null,
    strokeWidth: 2,
    opacity: 1,
    borderStyle: 'solid',
  } as AnnotationDTO<PdfCoordinates>;
}

describe('fromDTO — group/relationship mapping', () => {
  it('leaves irt/group undefined for a top-level annotation', () => {
    const record = fromDTO(fromFile(squareDTO(10)));
    expect(irtOf(record.annotation)).toBeUndefined();
    expect(groupOf(record.annotation)).toBeUndefined();
  });

  it('maps a `/RT /Group` subordinate to both irt and group (the primary key)', () => {
    const primary: AnnotationRef = {
      kind: 'objectNumber',
      page: toPageRef(1),
      objectNumber: 10,
    };
    const sub = fromDTO(fromFile(squareDTO(11, { to: primary, type: 'group' })));
    expect(irtOf(sub.annotation)).toBe(annotationKey(primary));
    expect(groupOf(sub.annotation)).toBe(annotationKey(primary)); // visual group → acts as a unit
  });

  it('maps a `/RT /R` comment reply to irt only, NOT group (not a visual group)', () => {
    const parent: AnnotationRef = {
      kind: 'objectNumber',
      page: toPageRef(1),
      objectNumber: 10,
    };
    const reply = fromDTO(fromFile(squareDTO(12, { to: parent, type: 'reply' })));
    expect(irtOf(reply.annotation)).toBe(annotationKey(parent));
    expect(groupOf(reply.annotation)).toBeUndefined();
  });
});

describe('record — Ink Highlight intent and blend', () => {
  const dto = (): AnnotationDTO<PdfCoordinates> => ({
    ref: { kind: 'objectNumber', page: toPageRef(1), objectNumber: 20 },
    page: toPageRef(1),
    index: 0,
    identityQuality: 'durable',
    nm: null,
    ...NO_FLAGS,
    rect: { left: 10, bottom: 740, right: 120, top: 760 },
    contents: null,
    subject: null,
    author: null,
    createdAt: null,
    modifiedAt: null,
    blendMode: 'multiply',
    rotation: null,
    dashArray: null,
    reply: null,
    popup: null,
    groupId: null,
    userId: null,
    createdBy: null,
    modifiedBy: null,
    importedBy: null,
    actions: null,
    subtype: 'ink',
    intent: 'ink-highlight',
    color: '#ffcd45',
    opacity: 1,
    strokeWidth: 14,
    borderStyle: 'solid',
    inkList: [
      [
        { x: 10, y: 750 },
        { x: 120, y: 750 },
      ],
    ],
  });

  it('reads its intent and blend off the annotation; an edit never restates the intent', () => {
    const record = fromDTO(fromFile(dto()));
    expect(record.annotation).toMatchObject({ intent: 'ink-highlight' });
    expect(styleOf(record.annotation).blendMode).toBe('multiply');
    // `/IT` is set at create: an edit writes what it changes, never the intent.
    const patch = fieldsWrite(record, { opacity: 0.5 });
    expect(patch).toEqual({ subtype: 'ink', opacity: 0.5 });
  });
});

/* ── callout free-text round-trip ─────────────────────────────────────────────
 * Coordinates are PDF user space (y-up). With this crop, content = (x, 800 - y).
 * The text box (`box`) is {200,600,320,660}; the engine's `rect`
 * {30,590,330,745} encloses the box + the leader (tip 40,740; knee 120,700) +
 * the arrow. The 3rd `/CL` point (the connection) is authored arbitrarily —
 * the reader ignores it and re-derives off the box.
 */
const BOX_PDF: PdfRect = { left: 200, bottom: 600, right: 320, top: 660 };
const OVERALL_PDF: PdfRect = { left: 30, bottom: 590, right: 330, top: 745 };
const CL: CalloutLine = [
  { x: 40, y: 740 }, // tip
  { x: 120, y: 700 }, // knee
  { x: 200, y: 630 }, // connection (ignored on read)
];

function calloutDTO(objectNumber = 20): AnnotationDTO<PdfCoordinates> {
  const ref: AnnotationRef = { kind: 'objectNumber', page: toPageRef(1), objectNumber };
  return {
    ref,
    page: toPageRef(1),
    index: 0,
    identityQuality: 'durable',
    nm: null,
    ...NO_FLAGS,
    rect: OVERALL_PDF,
    box: BOX_PDF,
    rotation: null,
    contents: 'see here',
    author: null,
    createdAt: null,
    modifiedAt: null,
    blendMode: 'normal',
    reply: null,
    popup: null,
    groupId: null,
    userId: null,
    createdBy: null,
    modifiedBy: null,
    importedBy: null,
    actions: null,
    subtype: 'free-text',
    intent: 'free-text-callout',
    fontFamily: 'helvetica',
    fontSize: 14,
    textAlign: 'left',
    verticalAlign: 'top',
    color: '#c80000',
    fontColor: '#1e1e1e',
    interiorColor: null,
    opacity: 1,
    strokeWidth: 1,
    borderStyle: 'solid',
    dashArray: null,
    cloudyIntensity: null,
    calloutLine: CL,
    lineEnding: 'open-arrow',
    // The rich text every free text reads with: its body is its fonts.
    richText: {
      body: {
        family: 'Helvetica',
        weight: 400,
        italic: false,
        size: 14,
        color: '#1e1e1e',
        decoration: [],
        script: 'normal',
        letterSpacing: 0,
        horizontalScale: 1,
        align: 'left',
        dir: 'ltr',
      },
      paragraphs: [{ runs: [{ text: 'see here' }] }],
    },
  } as unknown as AnnotationDTO<PdfCoordinates>;
}

/** A plain free-text DTO (no leader) for the contrast case. */
function plainFreeTextDTO(objectNumber = 21): AnnotationDTO<PdfCoordinates> {
  return {
    ...calloutDTO(objectNumber),
    intent: 'free-text',
    rect: BOX_PDF,
    calloutLine: null,
    lineEnding: null,
  } as AnnotationDTO<PdfCoordinates>;
}

/* ── rotation round-trip ───────────────────────────────────────────────────────
 * The shape's `rotation` and the engine's are both degrees clockwise, so the
 * angle passes through. Box kinds carry their `box` before the turn (`rect` is
 * the engine's upright box around it); points kinds keep their points upright
 * and the turn beside them.
 */
function rotatedSquareDTO(rotation: number, objectNumber = 30): AnnotationDTO<PdfCoordinates> {
  return {
    ...squareDTO(objectNumber),
    // For a square turned 90° the upright box around it is the box itself.
    rect: { left: 100, bottom: 100, right: 200, top: 200 },
    rotation,
  } as AnnotationDTO<PdfCoordinates>;
}

function rotatedPolylineDTO(rotation: number, objectNumber = 31): AnnotationDTO<PdfCoordinates> {
  const ref: AnnotationRef = { kind: 'objectNumber', page: toPageRef(1), objectNumber };
  return {
    ref,
    page: toPageRef(1),
    index: 0,
    identityQuality: 'durable',
    nm: null,
    ...NO_FLAGS,
    rect: { left: 100, bottom: 100, right: 300, top: 300 },
    contents: null,
    author: null,
    createdAt: null,
    modifiedAt: null,
    blendMode: 'normal',
    reply: null,
    popup: null,
    groupId: null,
    userId: null,
    createdBy: null,
    modifiedBy: null,
    importedBy: null,
    actions: null,
    subtype: 'polyline',
    color: '#000000',
    interiorColor: null,
    strokeWidth: 2,
    opacity: 1,
    borderStyle: 'solid',
    vertices: [
      { x: 120, y: 120 },
      { x: 200, y: 260 },
      { x: 280, y: 140 },
    ],
    lineEndings: { start: 'none', end: 'none' },
    rotation,
  } as AnnotationDTO<PdfCoordinates>;
}

describe('record — rotation round-trip', () => {
  it('box: the shape is the box and the clockwise turn', () => {
    const record = fromDTO(fromFile(rotatedSquareDTO(90)));
    const shape = shapeOf(record.annotation);
    if (shape.kind !== 'box') throw new Error('expected a box');
    // box {100,100,200,200} → page {x:100,y:600,w:100,h:100}
    expect(shape.box).toMatchObject({ x: 100, y: 600, width: 100, height: 100 });
    expect(shape.rotation).toBe(90);
  });

  it('box: its family writes the box and the turn, never a rect', () => {
    const record = fromDTO(fromFile(rotatedSquareDTO(90)));
    const patch = shapeWrite(record, shapeOf(record.annotation));
    expect(patch.rotation).toBe(90);
    expect(patch.box).toMatchObject({ left: 100, bottom: 100, right: 200, top: 200 });
    expect(patch).not.toHaveProperty('rect');
  });

  it('box: an upright box states its turn clear (a stale turn cannot linger)', () => {
    const record = fromDTO(fromFile(squareDTO(32)));
    // Tri-state writes keep omitted fields, so no turn is stated as null.
    expect(shapeWrite(record, shapeOf(record.annotation)).rotation).toBe(null);
  });

  it('points: the upright points and the turn are read as the engine keeps them, and written back', () => {
    const dto = rotatedPolylineDTO(30);
    if (dto.subtype !== 'polyline') throw new Error('expected polyline');
    const record = fromDTO(fromFile(dto));
    const shape = shapeOf(record.annotation);
    if (shape.kind !== 'poly') throw new Error('expected poly');
    expect(shape.rotation).toBe(30);
    // The shape keeps the points upright; where they are drawn is worked out.
    expect(shape.vertices[0]!.x).toBeCloseTo(dto.vertices[0]!.x - CROP.left, 9);
    expect(shape.vertices[0]!.y).toBeCloseTo(CROP.top - dto.vertices[0]!.y, 9);
    const drawn = pdfPointTurned(dto.vertices[0]!, pdfTurnOfUpright(dto.vertices, 30));
    expect(drawnStrokesOf(shape)[0]![0]!.x).toBeCloseTo(drawn.x - CROP.left, 9);
    expect(drawnStrokesOf(shape)[0]![0]!.y).toBeCloseTo(CROP.top - drawn.y, 9);

    const patch = shapeWrite(record, shape) as {
      rotation?: number;
      vertices?: { x: number; y: number }[];
    };
    expect(patch.rotation).toBe(30);
    expect(patch).not.toHaveProperty('box'); // points kinds never carry one
    expect(patch).not.toHaveProperty('rect'); // the engine works it out
    expect(patch.vertices?.[0]!.x).toBeCloseTo(120, 9);
    expect(patch.vertices?.[0]!.y).toBeCloseTo(120, 9);
  });

  it('points: an upright polyline states its turn clear', () => {
    const record = fromDTO(fromFile(rotatedPolylineDTO(0, 33)));
    const shape = shapeOf(record.annotation);
    expect(shape.kind === 'poly' && shape.rotation).toBeFalsy();
    expect(shapeWrite(record, shape).rotation).toBe(null);
  });
});

describe('record — free-text callout mapping', () => {
  it('a callout reads as a text box with a line (the box; the stored end dropped)', () => {
    const record = fromDTO(fromFile(calloutDTO()));
    const shape = shapeOf(record.annotation);
    if (shape.kind !== 'text-box' || !shape.calloutLine) throw new Error('expected a callout');
    // the text box, in page space
    expect(shape.box).toMatchObject({ x: 200, y: 140, width: 120, height: 60 });
    // tip / knee map to page space (y flips about the 800-pt crop)
    expect(shape.calloutLine[0]).toEqual({ x: 40, y: 60 });
    expect(shape.calloutLine[1]).toEqual({ x: 120, y: 100 });
    expect(shape.lineEnding).toBe('open-arrow');
  });

  it('a plain free text (no /CL) has no callout line', () => {
    const shape = shapeOf(fromDTO(fromFile(plainFreeTextDTO())).annotation);
    expect(shape.kind).toBe('text-box');
    expect(shape.kind === 'text-box' && shape.calloutLine).toBeNull();
  });

  it('a callout writes its text box, line and ending together; the engine works out rect', () => {
    const record = fromDTO(fromFile(calloutDTO()));
    const patch = shapeWrite(record, shapeOf(record.annotation)) as {
      calloutLine?: { x: number; y: number }[];
      lineEnding?: string;
      box?: PdfRect;
    };
    expect(patch.calloutLine).toHaveLength(3); // [tip, knee, where it meets the box]
    expect(patch.calloutLine![0]!.x).toBeCloseTo(40);
    expect(patch.calloutLine![0]!.y).toBeCloseTo(740);
    expect(patch.calloutLine![1]!.x).toBeCloseTo(120);
    expect(patch.calloutLine![1]!.y).toBeCloseTo(700);
    expect(patch.lineEnding).toBe('open-arrow');
    expect(patch.box).toMatchObject(BOX_PDF);
    expect(patch).not.toHaveProperty('rect');
  });
});

describe('record — free-text text', () => {
  it('its text is its fonts: fontColor is the text, never the border', () => {
    const record = fromDTO(fromFile(calloutDTO()));
    expect(textOf(record.annotation)).toEqual({
      fontFamily: 'helvetica',
      fontSize: 14,
      fontColor: '#1e1e1e', // the text's; the border's `color` is '#c80000'
      textAlign: 'left',
    });
  });

  it('a sidebar restyle writes the fields it changes, never the text itself', () => {
    const record = fromDTO(fromFile(plainFreeTextDTO()));
    const patch = fieldsWrite(record, {
      color: '#0000ff',
      interiorColor: '#ffff00',
      opacity: 0.5,
      fontSize: 22,
      fontColor: '#00ff00',
      textAlign: 'center',
    });
    expect(patch).toEqual({
      subtype: 'free-text',
      color: '#0000ff',
      interiorColor: '#ffff00',
      opacity: 0.5,
      fontSize: 22,
      fontColor: '#00ff00',
      textAlign: 'center',
    });
  });

  it("a font change on a callout writes the font alone: its line isn't restated", () => {
    const record = fromDTO(fromFile(calloutDTO(21)));
    expect(fieldsWrite(record, { fontSize: 20 })).toEqual({ subtype: 'free-text', fontSize: 20 });
    expect(fieldsWrite(record, { fontFamily: 'courier' })).toEqual({
      subtype: 'free-text',
      fontFamily: 'courier',
    });
  });
});

/* ── cloudy borders ───────────────────────────────────────────────────────────
 * A polygon's cloud curls are generated from /Vertices + /BE alone (no /RD; the
 * curls reach outward), a square's from its box. Either way the engine
 * measures `rect` around them: a write states the cloud, never a rect.
 */
function polygonDTO(
  cloudyIntensity: number | undefined,
  objectNumber = 40,
): AnnotationDTO<PdfCoordinates> {
  const ref: AnnotationRef = { kind: 'objectNumber', page: toPageRef(1), objectNumber };
  return {
    ref,
    page: toPageRef(1),
    index: 0,
    identityQuality: 'durable',
    nm: null,
    ...NO_FLAGS,
    rect: { left: 100, bottom: 100, right: 300, top: 300 },
    contents: null,
    author: null,
    createdAt: null,
    modifiedAt: null,
    blendMode: 'normal',
    reply: null,
    popup: null,
    groupId: null,
    userId: null,
    createdBy: null,
    modifiedBy: null,
    importedBy: null,
    actions: null,
    subtype: 'polygon',
    color: '#000000',
    interiorColor: null,
    strokeWidth: 2,
    opacity: 1,
    borderStyle: 'solid',
    vertices: [
      { x: 120, y: 120 },
      { x: 200, y: 260 },
      { x: 280, y: 140 },
    ],
    cloudyIntensity,
  } as AnnotationDTO<PdfCoordinates>;
}

describe('record — cloudy borders', () => {
  it("reads a polygon's and a square's /BE intensity as the cloud; a square's box stays its box", () => {
    expect(styleOf(fromDTO(fromFile(polygonDTO(2))).annotation).cloudyIntensity).toBe(2);
    const square = fromDTO(
      fromFile({ ...squareDTO(45), cloudyIntensity: 2 } as AnnotationDTO<PdfCoordinates>),
    );
    expect(styleOf(square.annotation).cloudyIntensity).toBe(2);
    const shape = shapeOf(square.annotation);
    const dto = square.annotation as Extract<AnnotationDTO, { subtype: 'square' }>;
    expect(shape.kind === 'box' && shape.box).toEqual(dto.box);
  });

  it('a cloud written on a polygon states the cloud and no rect: the engine measures the curls', () => {
    const record = fromDTO(fromFile(polygonDTO(undefined)));
    const patch = fieldsWrite(record, { cloudyIntensity: 2 });
    expect(patch).toEqual({ subtype: 'polygon', cloudyIntensity: 2 });
  });

  it('a solid border again states the cloud cleared (`null`), never omitted', () => {
    const polygon = fromDTO(fromFile(polygonDTO(2)));
    expect(fieldsWrite(polygon, { cloudyIntensity: null })).toEqual({
      subtype: 'polygon',
      cloudyIntensity: null,
    });
    const square = fromDTO(
      fromFile({ ...squareDTO(46), cloudyIntensity: 2 } as AnnotationDTO<PdfCoordinates>),
    );
    expect(fieldsWrite(square, { cloudyIntensity: null })).toEqual({
      subtype: 'square',
      cloudyIntensity: null,
    });
  });

  it('an open polyline has no cloud: one written to it is no change', () => {
    const record = fromDTO(fromFile(rotatedPolylineDTO(0, 41)));
    expect(fieldsWrite(record, { cloudyIntensity: 2 })).toBeNull();
  });
});

describe('record — a change writes only what it changes', () => {
  it('a moved square writes its box alone: no style, and not the turn it already has', () => {
    const record = fromDTO(
      fromFile({ ...squareDTO(60), rotation: 30 } as AnnotationDTO<PdfCoordinates>),
    );
    const shape = shapeOf(record.annotation);
    if (shape.kind !== 'box') throw new Error('expected a box');
    const moved = withShape(record, { ...shape, box: { ...shape.box, x: shape.box.x + 10 } });
    const patch = annotationPatchBetween(record.annotation, moved.annotation);
    expect(Object.keys(patch)).toEqual(['box']);
  });

  it('a moved link writes its rect alone: a foreign /A survives the move', () => {
    const record = fromDTO(
      fromFile({ ...squareDTO(61), subtype: 'link' } as AnnotationDTO<PdfCoordinates>),
    );
    const shape = shapeOf(record.annotation);
    if (shape.kind !== 'box') throw new Error('expected a box');
    const moved = withShape(record, { ...shape, box: { ...shape.box, x: shape.box.x + 10 } });
    const patch = annotationPatchBetween(record.annotation, moved.annotation);
    expect(Object.keys(patch)).toEqual(['rect']);
  });

  it('strokeWidth on a cloudy square writes only the width: the box is where the cloud starts', () => {
    const cloudy = fromDTO(
      fromFile({ ...squareDTO(62), cloudyIntensity: 2 } as AnnotationDTO<PdfCoordinates>),
    );
    expect(fieldsWrite(cloudy, { strokeWidth: 3 })).toEqual({ subtype: 'square', strokeWidth: 3 });
  });

  it('strokeWidth on a polygon states no rect: the engine measures the stroke', () => {
    const record = fromDTO(fromFile(polygonDTO(undefined)));
    expect(fieldsWrite(record, { strokeWidth: 3 })).toEqual({ subtype: 'polygon', strokeWidth: 3 });
  });

  it('a border change on a plain square writes the border alone: no cloud or box it already has', () => {
    const record = fromDTO(fromFile(squareDTO(63)));
    const patch = fieldsWrite(record, {
      borderStyle: 'dashed',
      dashArray: [4, 2],
      cloudyIntensity: null,
    });
    expect(patch).toEqual({ subtype: 'square', borderStyle: 'dashed', dashArray: [4, 2] });
  });

  it('opacity on a stamp reads and writes /CA alone (the engine re-bakes it)', () => {
    const {
      color: _color,
      interiorColor: _interiorColor,
      strokeWidth: _strokeWidth,
      borderStyle: _borderStyle,
      ...base
    } = squareDTO(65) as Extract<AnnotationDTO<PdfCoordinates>, { subtype: 'square' }>;
    const stamp = fromDTO(
      fromFile({
        ...base,
        subtype: 'stamp',
        name: null,
        fit: 'contain',
        opacity: 0.3,
        box: base.rect,
        rotation: null,
      } as AnnotationDTO<PdfCoordinates>),
    );
    expect(styleOf(stamp.annotation).opacity).toBe(0.3);
    expect(fieldsWrite(stamp, { opacity: 0.6 })).toEqual({ subtype: 'stamp', opacity: 0.6 });
  });

  it('a flag writes that flag; a value set to what it was, or a field the kind lacks, is no write', () => {
    const record = fromDTO(fromFile(squareDTO(64)));
    expect(toFile(writeOf(record, { type: 'setFlags', patch: { hidden: true } }))).toEqual({
      subtype: 'square',
      hidden: true,
    });
    expect(fieldsWrite(record, { color: '#000000', strokeWidth: 2 })).toBeNull();
    // A square has no line endings.
    expect(fieldsWrite(record, { lineEndings: { start: 'none', end: 'open-arrow' } })).toBeNull();
  });
});

describe('record — line endings leave /Rect to the engine', () => {
  const lineDTO = (lineEndings: { start: string; end: string }): AnnotationDTO<PdfCoordinates> =>
    ({
      ref: { kind: 'objectNumber', page: toPageRef(1), objectNumber: 77 },
      page: toPageRef(1),
      index: 0,
      identityQuality: 'durable',
      nm: null,
      ...NO_FLAGS,
      rect: { left: 100, bottom: 100, right: 300, top: 200 },
      contents: null,
      subject: null,
      author: null,
      createdAt: null,
      modifiedAt: null,
      blendMode: 'normal',
      reply: null,
      popup: null,
      groupId: null,
      userId: null,
      createdBy: null,
      modifiedBy: null,
      importedBy: null,
      actions: null,
      subtype: 'line',
      color: '#000000',
      interiorColor: null,
      strokeWidth: 4,
      opacity: 1,
      borderStyle: 'solid',
      linePoints: { start: { x: 120, y: 120 }, end: { x: 280, y: 180 } },
      lineEndings,
      rotation: null,
    }) as unknown as AnnotationDTO<PdfCoordinates>;

  it('new endings on a line state the endings and no rect: the engine measures the arrows', () => {
    const record = fromDTO(fromFile(lineDTO({ start: 'none', end: 'none' })));
    const arrows = { start: 'open-arrow', end: 'open-arrow' };
    expect(fieldsWrite(record, { lineEndings: arrows })).toEqual({
      subtype: 'line',
      lineEndings: arrows,
    });
  });

  it('polyline endings state no rect either', () => {
    const record = fromDTO(fromFile(rotatedPolylineDTO(0, 78)));
    const arrows = { start: 'closed-arrow', end: 'closed-arrow' };
    expect(fieldsWrite(record, { lineEndings: arrows })).toEqual({
      subtype: 'polyline',
      lineEndings: arrows,
    });
  });
});

describe('record — attached links (lens + desired state + link kind)', () => {
  const linkDTO = (
    objectNumber: number,
    target: PdfLinkTarget | null,
    reply?: { to: AnnotationRef; type: 'group' | 'reply' },
  ): AnnotationDTO<PdfCoordinates> =>
    ({
      ...squareDTO(objectNumber, reply ?? null),
      subtype: 'link',
      target,
    }) as unknown as AnnotationDTO<PdfCoordinates>;

  const URI = { kind: 'uri', uri: 'https://www.embedpdf.com/' } as const;
  const parentRef: AnnotationRef = {
    kind: 'objectNumber',
    page: toPageRef(1),
    objectNumber: 10,
  };

  // Minimal Model for lens reads (order + byId are all the lens touches).
  const lensModel = (records: ModelAnnotation[]): Model =>
    ({
      byId: Object.fromEntries(records.map((record) => [record.id, record])),
      order: records.map((record) => record.id),
    }) as unknown as Model;

  it("a link's target is read off it", () => {
    const record = fromDTO(fromFile(linkDTO(20, URI)));
    expect(kindOf(record.annotation).name).toBe('link');
    expect(record.annotation.subtype === 'link' && record.annotation.target).toEqual(URI);
  });

  it('a grouped link child is SUBSTRATE: classified attached, read via linkOf', () => {
    const parent = fromDTO(fromFile(squareDTO(10)));
    const child = fromDTO(fromFile(linkDTO(11, URI, { to: parentRef, type: 'group' })));
    // Nothing folds — both are first-class model annotations…
    expect(isAttachedLink(parent)).toBe(false);
    expect(isAttachedLink(child)).toBe(true);
    const model = lensModel([parent, child]);
    // …and the parent's value derives from the committed child.
    expect(linkOf(model, parent.id)).toEqual(URI);
    expect(linkChildrenOf(model, parent.id).map((record) => record.id)).toEqual([child.id]);
  });

  it('an orphan grouped link derives nothing for strangers and keeps its own target', () => {
    const orphan = fromDTO(
      fromFile(
        linkDTO(12, URI, {
          to: { kind: 'objectNumber', page: toPageRef(1), objectNumber: 99 },
          type: 'group',
        }),
      ),
    );
    const model = lensModel([orphan]);
    expect(linkOf(model, 'obj:1')).toBe(null); // no children of that parent
    expect(isAttachedLink(orphan)).toBe(true);
  });

  it('multi-segment: several children, ONE derived value (first child wins)', () => {
    const parent = fromDTO(fromFile(squareDTO(10)));
    const c1 = fromDTO(fromFile(linkDTO(11, URI, { to: parentRef, type: 'group' })));
    const c2 = fromDTO(fromFile(linkDTO(12, URI, { to: parentRef, type: 'group' })));
    const model = lensModel([parent, c1, c2]);
    expect(linkChildrenOf(model, parent.id)).toHaveLength(2);
    expect(linkOf(model, parent.id)).toEqual(URI);
  });

  it('linkChildRects: a ROTATED parent gets the AABB of its rotated footprint, not the unrotated box', () => {
    const square = fromDTO(fromFile(squareDTO(10)));
    // 100×100 box (from the DTO rect) with a 45° tilt: the rotated
    // footprint's AABB is 100·√2 ≈ 141.42 per side, centred on the box
    // centre — not the 100×100 unrotated box. (Stroke handling follows
    // `selectionQuad`'s own convention — the same envelope the chrome
    // outlines.)
    const rotated: Shape = {
      kind: 'box',
      box: { x: 100, y: 600, width: 100, height: 100 },
      ellipse: false,
      rotation: 45,
    };
    const [aabb] = linkChildRects(rotated, styleOf(square.annotation));
    const side = 100 * Math.SQRT2;
    expect(aabb.width).toBeCloseTo(side, 6);
    expect(aabb.height).toBeCloseTo(side, 6);
    expect(aabb.x + aabb.width / 2).toBeCloseTo(150, 6); // centre preserved
    expect(aabb.y + aabb.height / 2).toBeCloseTo(650, 6);
  });

  it('linkChildRects: one rect per markup quad, one visual-bounds rect otherwise', () => {
    const square = fromDTO(fromFile(squareDTO(10)));
    const style = styleOf(square.annotation);
    expect(linkChildRects(shapeOf(square.annotation), style)).toHaveLength(1);
    const quads: Shape = {
      kind: 'quads',
      quadPoints: [
        quadFromRect({ x: 0, y: 0, width: 50, height: 10 }),
        quadFromRect({ x: 0, y: 20, width: 30, height: 10 }),
      ],
    };
    const rects = linkChildRects(quads, style);
    expect(rects).toHaveLength(2);
    expect(rects[0]).toEqual({ x: 0, y: 0, width: 50, height: 10 });
  });

  it('a link annotation takes a writable target, and null clears it; a read-only one is never written', () => {
    const record = fromDTO(fromFile(linkDTO(20, null)));
    expect(writeOf(record, { type: 'setLink', target: URI })).toEqual({
      subtype: 'link',
      target: URI,
    });
    const linked = fromDTO(fromFile(linkDTO(21, URI)));
    expect(writeOf(linked, { type: 'setLink', target: null })).toEqual({
      subtype: 'link',
      target: null,
    });
    // A script is carried, never (re)written: the foreign /A survives.
    const script = { kind: 'javascript', script: 'app.alert(1)' } as unknown as PdfLinkTarget;
    expect(writeOf(linked, { type: 'setLink', target: script })).toBeNull();
  });
});

describe('record — every field a kind takes writes only fields its engine kind has', () => {
  const PAGE = toPageRef(1);
  const box = { x: 100, y: 100, width: 80, height: 40 };
  const geometryOf = (subtype: string): Shape => {
    switch (subtype) {
      case 'free-text':
        return { kind: 'text-box', box: box, rotation: 0, calloutLine: null, lineEnding: null };
      case 'line':
        return {
          kind: 'line',
          linePoints: { start: { x: 100, y: 100 }, end: { x: 200, y: 150 } },
          rotation: 0,
        };
      case 'polygon':
      case 'polyline':
        return {
          kind: 'poly',
          vertices: [
            { x: 100, y: 100 },
            { x: 200, y: 100 },
            { x: 150, y: 180 },
          ],
          closed: subtype === 'polygon',
          rotation: 0,
        };
      case 'ink':
        return {
          kind: 'ink',
          inkList: [
            [
              { x: 100, y: 100 },
              { x: 150, y: 120 },
            ],
          ],
          rotation: 0,
        };
      case 'highlight':
      case 'underline':
      case 'squiggly':
      case 'strikeout':
      case 'redact':
        return { kind: 'quads', quadPoints: [quadFromRect(box)] };
      case 'caret':
        return { kind: 'caret', box: box, rotation: 0 };
      default:
        return { kind: 'box', box: box, rotation: 0, ellipse: subtype === 'circle' };
    }
  };
  /** The message a sidebar sends for one field spec: a field, a text format or a link. */
  const messageFor = (spec: FieldSpec, id: string): Message => {
    switch (spec.key) {
      case 'bold':
      case 'italic':
      case 'underline':
        return { type: 'setTextFormat', format: spec.key, on: true };
      case 'link':
        return { type: 'setLink', target: { kind: 'uri', uri: 'https://example.com' } };
      case 'borderStyle':
        return {
          type: 'setFields',
          patches: {
            [id]: {
              borderStyle: 'dashed',
              dashArray: [4, 2],
              ...(spec.cloudy ? { cloudyIntensity: 2 } : {}),
            },
          },
        };
      case 'icon':
        return { type: 'setFields', patches: { [id]: { icon: spec.options[1] } } };
      default:
        return { type: 'setFields', patches: { [id]: { [spec.key]: VALUES[spec.key] } } };
    }
  };
  const VALUES: Record<string, unknown> = {
    color: '#123456',
    interiorColor: '#654321',
    fontColor: '#abcdef',
    opacity: 0.5,
    strokeWidth: 3,
    fontSize: 20,
    lineEndings: { start: 'none', end: 'open-arrow' },
    fontFamily: 'times-roman',
    textAlign: 'center',
    blendMode: 'multiply',
  };

  for (const [subtype, kind] of Object.entries(KINDS)) {
    for (const spec of kind.fields) {
      it(`${subtype}: ${spec.key}`, () => {
        const before = recordOf({
          id: 'obj:1',
          ref: { kind: 'objectNumber', page: PAGE, objectNumber: 1 },
          page: PAGE,
          subtype,
          geometry: geometryOf(subtype),
          style: {
            color: '#000000',
            interiorColor: null,
            strokeWidth: 1,
            opacity: 1,
            blendMode: 'normal',
            borderStyle: 'solid',
            dashArray: null,
            cloudyIntensity: null,
          },
          ...(subtype === 'free-text' || subtype.startsWith('widget-')
            ? {
                text: {
                  fontFamily: 'helvetica',
                  fontSize: 12,
                  fontColor: '#000000',
                  textAlign: 'left' as const,
                },
              }
            : {}),
          ...(spec.key === 'icon' ? { icon: spec.options[0] } : {}),
          ...(subtype === 'link' ? { link: null } : {}),
          flags: DRAWN_FLAGS,
          source: 'baked',
        });
        const result = update(
          modelWith([before], { selected: [before.id] }),
          messageFor(spec, before.id),
        );
        // The change is written (a link rides its own effect)…
        const patch = result.change.patches[before.id];
        if (spec.key === 'link' && subtype !== 'link') {
          expect(result.effects).toContainEqual(expect.objectContaining({ type: 'syncLink' }));
          return;
        }
        expect(patch).toBeDefined();
        // …and the engine takes it, so the record's annotation follows.
        expect(() => applyAnnotationPatch(before.annotation, patch!)).not.toThrow();
      });
    }
  }
});

describe('record — a record answers its parent', () => {
  it('a test record states the annotation it answers', () => {
    const parent: AnnotationRef = { kind: 'objectNumber', page: toPageRef(1), objectNumber: 10 };
    const child = recordOf({
      id: 'c',
      ref: null,
      page: toPageRef(1),
      subtype: 'square',
      geometry: {
        kind: 'box',
        box: { x: 0, y: 0, width: 10, height: 10 },
        rotation: 0,
        ellipse: false,
      },
      style: styleOf(fromDTO(fromFile(squareDTO(10))).annotation),
      flags: DRAWN_FLAGS,
      source: 'vector',
      annotation: answering(parent, 'group'),
    });
    expect(groupOf(child.annotation)).toBe(annotationKey(parent));
    expect(child.unconfirmed).toBe(true);
  });
});
