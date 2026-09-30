import { annotationKey } from '@embedpdf/core';
import { quadFromRect } from '@embedpdf/core-geometry';
import type {
  AnnotationDraft,
  AnnotationDTO,
  AnnotationFlags,
  AnnotationPatch,
  AnnotationRef,
  CalloutLine,
  PdfCoordinates,
  PdfRect,
} from '@embedpdf/engine-core/runtime';
import {
  annotationPatchBetween,
  applyAnnotationPatch,
  pageAnnotationOf,
  pdfAnnotationDraftOf,
  pdfAnnotationPatchOf,
  pdfPointTurned,
  pdfTurnOfUpright,
  toPageRef,
} from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { DRAWN_FLAGS } from '../src/flags';
import { linkChildrenOf, linkOf } from '../src/links';
import { isAttachedLink } from '../src/plane';
import type {
  Message,
  Model,
  ModelAnnotation,
  ModelGeometry,
  RecordFields,
  Style,
} from '../src/types';
import { answering, modelWith, record } from './support';
import { KINDS, type FieldSpec } from '../src/kinds';
import { update } from '../src/update';
import {
  fieldsOf,
  fromDTO,
  groupOf,
  irtOf,
  kindOf,
  linkChildRects,
  shapeOf,
  toCreateDraft,
  toPatch,
  withFields,
} from '../src/record';
import { drawnStrokesOf } from '../src/shapes/points';

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
const toFile = (patch: AnnotationPatch | null): AnnotationPatch<PdfCoordinates> | null =>
  patch && pdfAnnotationPatchOf(patch, CROP, boxOf);
/**
 * What changing a record's fields writes: the annotation fields the change
 * moved, as `update` sends them. `null` when it moved none.
 */
const writeOf = (
  annotation: ModelAnnotation,
  change: Partial<RecordFields>,
): AnnotationPatch | null => {
  const patch = annotationPatchBetween(
    annotation.annotation,
    withFields(annotation, change).annotation,
  );
  return Object.keys(patch).length
    ? ({ ...patch, subtype: annotation.annotation.subtype } as AnnotationPatch)
    : null;
};
/** A create as the engine writes it to the file. */
const draftToFile = (draft: AnnotationDraft | null): AnnotationDraft<PdfCoordinates> | null =>
  draft && pdfAnnotationDraftOf(draft, CROP, boxOf);

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
    const annotation = fromDTO(fromFile(squareDTO(10)));
    expect(irtOf(annotation.annotation)).toBeUndefined();
    expect(groupOf(annotation.annotation)).toBeUndefined();
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

  it('round-trips intent and blend through the content model, draft, and patch', () => {
    const annotation = fromDTO(fromFile(dto()));
    expect(fieldsOf(annotation).intent).toBe('ink-highlight');
    expect(fieldsOf(annotation).style.blendMode).toBe('multiply');
    expect(draftToFile(toCreateDraft(fieldsOf(annotation)))).toMatchObject({
      subtype: 'ink',
      intent: 'ink-highlight',
      blendMode: 'multiply',
    });
    // `/IT` is a create-only statement: patches don't restate it (the engine's
    // tri-state law preserves what a patch omits), so only the draft carries it.
    const patch = toFile(toPatch(fieldsOf(annotation))) as Record<string, unknown> | null;
    expect(patch).toMatchObject({ subtype: 'ink', blendMode: 'multiply' });
    expect(patch).not.toHaveProperty('intent');
  });
});

describe('record — Replace Text authoring', () => {
  const style: Style = {
    color: '#e44234',
    interiorColor: null,
    strokeWidth: 1,
    opacity: 1,
    blendMode: 'normal' as const,
    borderStyle: 'solid',
    dashArray: null,
    cloudyIntensity: null,
  };

  it('emits the normalized Caret and StrikeOut intents with print flags', () => {
    const caret = record({
      id: 'tmp:1',
      ref: null,
      page: toPageRef(1),
      subtype: 'caret',
      intent: 'replace',
      geometry: { kind: 'caret', box: { x: 90, y: 40, width: 10, height: 10 }, rotation: 0 },
      style,
      flags: DRAWN_FLAGS,
      source: 'vector',
    });
    const strikeout = record({
      id: 'tmp:2',
      ref: null,
      page: toPageRef(1),
      subtype: 'strikeout',
      intent: 'strikeout-text-edit',
      geometry: {
        kind: 'quads',
        quadPoints: [quadFromRect({ x: 10, y: 20, width: 80, height: 15 })],
      },
      style,
      flags: DRAWN_FLAGS,
      source: 'vector',
      annotation: answering(caret.annotation.ref, 'group'),
    });

    expect(draftToFile(toCreateDraft(fieldsOf(caret)))).toMatchObject({
      subtype: 'caret',
      intent: 'replace',
      print: true,
      box: { left: 90, right: 100, bottom: 750, top: 760 },
    });
    expect(draftToFile(toCreateDraft(fieldsOf(strikeout)))).toMatchObject({
      subtype: 'strikeout',
      intent: 'strikeout-text-edit',
      print: true,
    });
  });

  it('a rotated caret emits its box and its turn', () => {
    const caret = record({
      id: 'tmp:3',
      ref: null,
      page: toPageRef(1),
      subtype: 'caret',
      geometry: { kind: 'caret', box: { x: 94, y: 53, width: 6, height: 6 }, rotation: 270 },
      style,
      flags: DRAWN_FLAGS,
      source: 'vector',
    });
    const caretGeometry = shapeOf(caret.annotation);
    // Clockwise 270° passes through with the box; the engine works out `rect`.
    const draft = draftToFile(toCreateDraft(fieldsOf(caret)));
    expect(draft).toMatchObject({
      subtype: 'caret',
      rotation: 270,
      box: { left: 94, right: 100, bottom: 741, top: 747 },
    });
    expect(draft).not.toHaveProperty('rect');

    if (caretGeometry.kind !== 'caret') throw new Error('Expected caret projection');
    const upright: RecordFields = {
      ...fieldsOf(caret),
      geometry: { kind: 'caret', box: caretGeometry.box, rotation: 0 },
    };
    // Tri-state flatten: upright carets state null so a stale turn can't linger.
    expect(draftToFile(toCreateDraft(upright))).toMatchObject({ rotation: null });
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
  } as AnnotationDTO<PdfCoordinates>;
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
 * The model's `rot` and the engine DTO's `rotation` are both degrees clockwise,
 * so the angle passes through. Box kinds carry their `box`
 * before the turn (`rect` is the engine's upright box around it); vertex
 * kinds keep an advisory scalar only (the points are already rotated).
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
  it('box: fromDTO reads the box and the clockwise rot', () => {
    const annotation = fromDTO(fromFile(rotatedSquareDTO(90)));
    const geometry = shapeOf(annotation.annotation);
    if (geometry.kind !== 'box') throw new Error('expected rect geom');
    // box {100,100,200,200} → content {x:100,y:600,w:100,h:100}
    expect(geometry.box).toMatchObject({ x: 100, y: 600, width: 100, height: 100 });
    expect(geometry.rotation).toBe(90);
  });

  it('box: toPatch emits the box + rotation, and no rect', () => {
    const patch = toFile(toPatch(fieldsOf(fromDTO(fromFile(rotatedSquareDTO(90)))))) as Extract<
      AnnotationPatch<PdfCoordinates>,
      { subtype?: 'square' }
    >;
    if (!patch) throw new Error('expected a patch');
    expect(patch.rotation).toBe(90);
    expect(patch.box).toMatchObject({ left: 100, bottom: 100, right: 200, top: 200 });
    expect(patch).not.toHaveProperty('rect');
  });

  it('box: an unrotated DTO states the turn clear explicitly (total projection)', () => {
    const patch = toFile(toPatch(fieldsOf(fromDTO(fromFile(squareDTO(32)))))) as Extract<
      AnnotationPatch<PdfCoordinates>,
      { subtype?: 'square' }
    >;
    if (!patch) throw new Error('expected a patch');
    // Tri-state writes preserve omitted fields, so rotation 0 must be stated
    // as null — omission would keep a stale rotation on the document.
    expect(patch.rotation).toBe(null);
  });

  it('vertex: the upright points and turn are read as the engine keeps them, and written back', () => {
    const dto = rotatedPolylineDTO(30);
    if (dto.subtype !== 'polyline') throw new Error('expected polyline');
    const annotation = fromDTO(fromFile(dto));
    const geometry = shapeOf(annotation.annotation);
    if (geometry.kind !== 'poly') throw new Error('expected poly geom');
    expect(geometry.rotation).toBe(30);
    // The model keeps the points upright; where they are drawn is worked out.
    expect(geometry.vertices[0]!.x).toBeCloseTo(dto.vertices[0]!.x - CROP.left, 9);
    expect(geometry.vertices[0]!.y).toBeCloseTo(CROP.top - dto.vertices[0]!.y, 9);
    const drawn = pdfPointTurned(dto.vertices[0]!, pdfTurnOfUpright(dto.vertices, 30));
    expect(drawnStrokesOf(geometry)[0]![0]!.x).toBeCloseTo(drawn.x - CROP.left, 9);
    expect(drawnStrokesOf(geometry)[0]![0]!.y).toBeCloseTo(CROP.top - drawn.y, 9);

    const patch = toFile(toPatch(fieldsOf(annotation))) as Extract<
      AnnotationPatch<PdfCoordinates>,
      { subtype?: 'polyline' }
    > & {
      rotation?: number;
    };
    if (!patch) throw new Error('expected a patch');
    expect(patch.rotation).toBe(30);
    expect(patch).not.toHaveProperty('box'); // vertex kinds never carry one
    expect(patch).not.toHaveProperty('rect'); // the engine works it out
    expect(patch.vertices?.[0]!.x).toBeCloseTo(120, 9);
    expect(patch.vertices?.[0]!.y).toBeCloseTo(120, 9);
  });

  it('vertex: an unrotated polyline states the advisory clear explicitly', () => {
    const annotation = fromDTO(fromFile(rotatedPolylineDTO(0, 33)));
    const geometry = shapeOf(annotation.annotation);
    expect(geometry.kind === 'poly' && geometry.rotation).toBeFalsy();
    const patch = toFile(toPatch(fieldsOf(annotation))) as Extract<
      AnnotationPatch<PdfCoordinates>,
      { subtype?: 'polyline' }
    > & {
      rotation?: number | null;
    };
    expect(patch?.rotation).toBe(null);
  });
});

describe('record — free-text callout mapping', () => {
  it('fromDTO: intent + /CL → a text geom with a leader (the box, conn dropped)', () => {
    const annotation = fromDTO(fromFile(calloutDTO()));
    const geometry = shapeOf(annotation.annotation);
    expect(geometry.kind).toBe('text-box');
    if (geometry.kind !== 'text-box' || !geometry.calloutLine)
      throw new Error('expected callout geom');
    // the text box, in page space
    expect(geometry.box).toMatchObject({ x: 200, y: 140, width: 120, height: 60 });
    // tip / knee map to page space (y flips about the 800-pt crop)
    expect(geometry.calloutLine[0]).toEqual({ x: 40, y: 60 });
    expect(geometry.calloutLine[1]).toEqual({ x: 120, y: 100 });
    expect(geometry.lineEnding).toBe('open-arrow');
  });

  it('fromDTO: a plain free-text (no /CL) has no callout', () => {
    const annotation = fromDTO(fromFile(plainFreeTextDTO()));
    const geometry = shapeOf(annotation.annotation);
    expect(geometry.kind).toBe('text-box');
    expect(geometry.kind === 'text-box' && geometry.calloutLine).toBeNull();
  });

  it('toCreateDraft: a callout geom → intent + the text box + /CL + /LE', () => {
    const draft = draftToFile(toCreateDraft(fieldsOf(fromDTO(fromFile(calloutDTO()))))) as Extract<
      AnnotationDraft<PdfCoordinates>,
      { subtype: 'free-text' }
    >;
    expect(draft.intent).toBe('free-text-callout');
    expect(draft.lineEnding).toBe('open-arrow');
    // tip + knee round-trip back to PDF user space
    expect(draft.calloutLine).toBeDefined();
    expect(draft.calloutLine!).toHaveLength(3); // [tip, knee, derived conn]
    expect(draft.calloutLine![0].x).toBeCloseTo(40);
    expect(draft.calloutLine![0].y).toBeCloseTo(740);
    expect(draft.calloutLine![1].x).toBeCloseTo(120);
    expect(draft.calloutLine![1].y).toBeCloseTo(700);
    // the text box is sent; the engine works out `rect` around the leader
    expect(draft.box).toMatchObject(BOX_PDF);
    expect(draft).not.toHaveProperty('rect');
    expect(draft).not.toHaveProperty('rectDifferences');
  });

  it('toCreateDraft: a plain free-text → intent free-text + its box (no leader)', () => {
    const draft = draftToFile(
      toCreateDraft(fieldsOf(fromDTO(fromFile(plainFreeTextDTO())))),
    ) as Extract<AnnotationDraft<PdfCoordinates>, { subtype: 'free-text' }>;
    expect(draft.intent).toBe('free-text');
    expect(draft.calloutLine).toBeUndefined();
    expect(draft.box).toMatchObject(BOX_PDF);
  });

  it('toPatch: a callout sends the text box + /CL + /LE together', () => {
    const patch = toFile(toPatch(fieldsOf(fromDTO(fromFile(calloutDTO()))))) as Extract<
      AnnotationPatch<PdfCoordinates>,
      { subtype?: 'free-text' }
    > | null;
    if (!patch) throw new Error('expected a patch');
    expect(patch.calloutLine).toHaveLength(3);
    expect(patch.lineEnding).toBe('open-arrow');
    expect(patch.box).toMatchObject(BOX_PDF);
  });
});

describe('record — free-text style + font round-trip', () => {
  it('fromDTO projects the text fields into `text`: fontColor is the text, never the border', () => {
    const annotation = fromDTO(fromFile(calloutDTO()));
    expect(fieldsOf(annotation).text).toEqual({
      fontFamily: 'helvetica',
      fontSize: 14,
      fontColor: '#1e1e1e', // the text's; the border's `color` is '#c80000'
      textAlign: 'left',
    });
  });

  it('toPatch carries the FULL style + font set for free-text (a sidebar edit round-trips)', () => {
    const annotation = fromDTO(fromFile(plainFreeTextDTO()));
    // a props edit: restyle + refont the box (what updateSelection applies)
    const edited = {
      ...fieldsOf(annotation),
      style: {
        ...fieldsOf(annotation).style,
        color: '#0000ff',
        interiorColor: '#ffff00',
        opacity: 0.5,
      },
      text: {
        ...fieldsOf(annotation).text!,
        fontSize: 22,
        fontColor: '#00ff00',
        textAlign: 'center' as const,
      },
    };
    const patch = toFile(toPatch(edited)) as Extract<
      AnnotationPatch<PdfCoordinates>,
      { subtype?: 'free-text' }
    >;
    expect(patch.color).toEqual('#0000ff');
    expect(patch.interiorColor).toEqual('#ffff00');
    expect(patch.opacity).toBe(0.5);
    expect(patch.fontSize).toBe(22);
    expect(patch.fontColor).toEqual('#00ff00');
    expect(patch.textAlign).toBe('center');
    expect(patch.fontFamily).toBe('helvetica');
    // contents is owned by the debounced text-edit write — never duplicated here
    expect(patch).not.toHaveProperty('contents');
  });

  it('toPatch carries style + font for a callout too, alongside the leader fields', () => {
    const annotation = fromDTO(fromFile(calloutDTO()));
    const edited = {
      ...fieldsOf(annotation),
      text: { ...fieldsOf(annotation).text!, fontFamily: 'courier' },
    };
    const patch = toFile(toPatch(edited)) as Extract<
      AnnotationPatch<PdfCoordinates>,
      { subtype?: 'free-text' }
    >;
    expect(patch.calloutLine).toHaveLength(3); // geometry still round-trips
    expect(patch.fontFamily).toBe('courier');
    expect(patch.strokeWidth).toBe(1);
  });

  it('toCreateDraft seeds the draft from `text` (the tool font defaults), not hardcoded values', () => {
    const annotation = fromDTO(fromFile(plainFreeTextDTO()));
    const seeded = {
      ...fieldsOf(annotation),
      text: { ...fieldsOf(annotation).text!, fontSize: 18, textAlign: 'right' as const },
    };
    const draft = draftToFile(toCreateDraft(seeded)) as Extract<
      AnnotationDraft<PdfCoordinates>,
      { subtype: 'free-text' }
    >;
    expect(draft.fontSize).toBe(18);
    expect(draft.textAlign).toBe('right');
    expect(draft.contents).toBe('see here');
  });
});

/* ── polygon cloudy border round-trip ─────────────────────────────────────────
 * A polygon's cloud curls are generated from /Vertices + /BE alone (no /RD; the
 * curls reach outward), so the patch must carry `cloudyIntensity` and a /Rect
 * grown by the cloud extent — the regression here was a patch with neither, so
 * the engine round-trip snapped the border back to solid.
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

describe('record — polygon cloudy border', () => {
  it('fromDTO reads /BE intensity into a cloudy border', () => {
    const annotation = fromDTO(fromFile(polygonDTO(2)));
    expect(fieldsOf(annotation).style.cloudyIntensity).toBe(2);
  });

  it('toPatch carries cloudyIntensity and no rect: the engine measures the curls', () => {
    const annotation = fromDTO(fromFile(polygonDTO(2)));
    const patch = toFile(toPatch(fieldsOf(annotation))) as Extract<
      AnnotationPatch<PdfCoordinates>,
      { subtype?: 'polygon' }
    >;
    expect(patch.cloudyIntensity).toBe(2);
    expect(patch).not.toHaveProperty('rect');
    // no /RD for polygons — the curls are derived from /Vertices + /BE alone
    expect(patch).not.toHaveProperty('rectDifferences');
  });

  it('toPatch clears the effect with cloudyIntensity null when the border is solid again', () => {
    const annotation = fromDTO(fromFile(polygonDTO(2)));
    const solid = {
      ...fieldsOf(annotation),
      style: {
        ...fieldsOf(annotation).style,
        borderStyle: 'solid' as const,
        dashArray: null,
        cloudyIntensity: null,
      },
    };
    const patch = toFile(toPatch(solid)) as Extract<
      AnnotationPatch<PdfCoordinates>,
      { subtype?: 'polygon' }
    >;
    expect(patch.cloudyIntensity).toBe(null); // tri-state remove of /BE
    expect(patch).not.toHaveProperty('rect');
  });

  it('an open polyline never carries cloudy fields', () => {
    const annotation = fromDTO(fromFile(rotatedPolylineDTO(0, 41)));
    const cloudyStyled = {
      ...fieldsOf(annotation),
      style: {
        ...fieldsOf(annotation).style,
        borderStyle: 'solid' as const,
        dashArray: null,
        cloudyIntensity: 2,
      },
    };
    const patch = toFile(toPatch(cloudyStyled)) as Extract<
      AnnotationPatch<PdfCoordinates>,
      { subtype?: 'polyline' }
    >;
    expect(patch).not.toHaveProperty('cloudyIntensity');
  });
});

describe('record — withFields (a change is its write)', () => {
  const moved = (annotation: ModelAnnotation, dx: number): Partial<RecordFields> => {
    const geometry = shapeOf(annotation.annotation) as Extract<
      RecordFields['geometry'],
      { kind: 'box' }
    >;
    return { geometry: { ...geometry, box: { ...geometry.box, x: geometry.box.x + dx } } };
  };
  const patchOf = (annotation: ModelAnnotation, change: Partial<RecordFields>) =>
    toFile(writeOf(annotation, change)) as unknown as Record<string, unknown>;

  it('a moved square writes ONLY its box (no style biography, no unchanged turn)', () => {
    const annotation = fromDTO(fromFile(squareDTO(60)));
    const patch = patchOf(annotation, moved(annotation, 10));
    expect(Object.keys(patch).sort()).toEqual(['box', 'subtype']);
    expect(patch.box).toMatchObject({ left: 110, right: 210 });
  });

  it('a moved link omits target — a foreign /A survives the move', () => {
    const annotation = fromDTO(
      fromFile({ ...squareDTO(61), subtype: 'link' } as AnnotationDTO<PdfCoordinates>),
    );
    const patch = patchOf(annotation, moved(annotation, 10));
    expect(patch.subtype).toBe('link');
    expect(patch).not.toHaveProperty('target');
  });

  it('a text style change writes its key 1:1 (fontSize alone, engine RMW makes it safe)', () => {
    const annotation = fromDTO(fromFile(calloutDTO(21)));
    const patch = patchOf(annotation, { text: { ...fieldsOf(annotation).text!, fontSize: 20 } });
    expect(patch).toEqual({ subtype: 'free-text', fontSize: 20 });
  });

  it('strokeWidth on a CLOUDY square writes only the width: the box is where the cloud starts', () => {
    const cloudy = fromDTO(
      fromFile({ ...squareDTO(62), cloudyIntensity: 2 } as AnnotationDTO<PdfCoordinates>),
    );
    const patch = patchOf(cloudy, { style: { ...fieldsOf(cloudy).style, strokeWidth: 3 } });
    expect(patch).toEqual({ subtype: 'square', strokeWidth: 3 });
  });

  it('strokeWidth on a polygon sends no rect: the engine measures the stroke', () => {
    const annotation = fromDTO(fromFile(polygonDTO(undefined)));
    const { style } = fieldsOf(annotation);
    const patch = patchOf(annotation, { style: { ...style, strokeWidth: style.strokeWidth + 1 } });
    expect(patch.strokeWidth).toBe(fieldsOf(annotation).style.strokeWidth + 1);
    expect(patch).not.toHaveProperty('rect');
  });

  it('a border change on a plain square writes the border alone: no cloud or box it already has', () => {
    const annotation = fromDTO(fromFile(squareDTO(63)));
    const patch = patchOf(annotation, {
      style: {
        ...fieldsOf(annotation).style,
        borderStyle: 'dashed' as const,
        dashArray: [4, 2],
        cloudyIntensity: null,
      },
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
    expect(fieldsOf(stamp).style.opacity).toBe(0.3);
    const patch = patchOf(stamp, { style: { ...fieldsOf(stamp).style, opacity: 0.6 } });
    expect(patch).toEqual({ subtype: 'stamp', opacity: 0.6 });
  });

  it('writes only what changed: each changed flag, and nothing for a change the engine keeps nothing of', () => {
    const annotation = fromDTO(fromFile(squareDTO(64)));
    const geometry = shapeOf(annotation.annotation);
    const { flags, style } = fieldsOf(annotation);
    expect(patchOf(annotation, { flags: { ...flags, hidden: true } })).toEqual({
      subtype: 'square',
      hidden: true,
    });
    // Live rendering, and a style value set to what it was, are no write.
    expect(writeOf(annotation, { source: 'vector' })).toBeNull();
    expect(writeOf(annotation, { style: { ...style } })).toBeNull();
    // A key the kind doesn't take is never written (a square has no line endings).
    expect(
      writeOf(annotation, {
        geometry: { ...geometry, ends: { start: 'none', end: 'open-arrow' } } as never,
      }),
    ).toBeNull();
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

  type RectPatch = { lineEndings?: unknown; rect?: PdfRect };

  it('new lineEndings on a line send the endings and no rect: the engine measures the arrows', () => {
    const none = fromDTO(fromFile(lineDTO({ start: 'none', end: 'none' })));
    // The user's gesture: arrows on both ends.
    const arrows = {
      geometry: {
        ...fieldsOf(none).geometry,
        lineEndings: { start: 'open-arrow', end: 'open-arrow' },
      },
    } as Partial<RecordFields>;
    const patch = toFile(writeOf(none, arrows)) as RectPatch;
    expect(patch.lineEndings).toEqual({ start: 'open-arrow', end: 'open-arrow' });
    expect(patch).not.toHaveProperty('rect');
  });

  it('polyline endings send no rect either', () => {
    const base = fromDTO(fromFile(rotatedPolylineDTO(0, 78)));
    const arrows = {
      geometry: {
        ...fieldsOf(base).geometry,
        lineEndings: { start: 'closed-arrow', end: 'closed-arrow' },
      },
    } as Partial<RecordFields>;
    const patch = toFile(writeOf(base, arrows)) as RectPatch;
    expect(patch.lineEndings).toBeDefined();
    expect(patch).not.toHaveProperty('rect');
  });
});

describe('record — shape cloudy border tri-state', () => {
  const cloudySquare = (objectNumber = 45): AnnotationDTO<PdfCoordinates> =>
    ({ ...squareDTO(objectNumber), cloudyIntensity: 2 }) as AnnotationDTO<PdfCoordinates>;

  it("fromDTO reads /BE intensity into a cloudy border; the shape's box is the engine's box", () => {
    const annotation = fromDTO(fromFile(cloudySquare()));
    const geometry = shapeOf(annotation.annotation);
    expect(fieldsOf(annotation).style.cloudyIntensity).toBe(2);
    if (geometry.kind !== 'box') throw new Error('expected a box');
    const square = annotation.annotation as Extract<AnnotationDTO, { subtype: 'square' }>;
    expect(geometry.box).toEqual(square.box);
  });

  it('toPatch on a cloudy square carries /BE and the box the cloud starts from', () => {
    const patch = toFile(toPatch(fieldsOf(fromDTO(fromFile(cloudySquare()))))) as Extract<
      AnnotationPatch<PdfCoordinates>,
      { subtype?: 'square' }
    >;
    expect(patch.cloudyIntensity).toBe(2);
    expect(patch.box!.left).toBeCloseTo(100);
    expect(patch.box!.top).toBeCloseTo(200);
  });

  it('toPatch states the clear when the border is solid again, and the box stays', () => {
    const annotation = fromDTO(fromFile(cloudySquare()));
    const solid = {
      ...fieldsOf(annotation),
      style: {
        ...fieldsOf(annotation).style,
        borderStyle: 'solid' as const,
        dashArray: null,
        cloudyIntensity: null,
      },
    };
    const patch = toFile(toPatch(solid)) as Extract<
      AnnotationPatch<PdfCoordinates>,
      { subtype?: 'square' }
    >;
    // Tri-state remove: /BE is stated as null, never omitted.
    expect(patch.cloudyIntensity).toBe(null);
    expect(patch.box!.left).toBeCloseTo(100);
    expect(patch.box!.top).toBeCloseTo(200);
  });
});

describe('record — attached links (fold + desired state + link kind mapping)', () => {
  const linkDTO = (
    objectNumber: number,
    target: import('@embedpdf/engine-core/runtime').PdfLinkTarget | null,
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
  const modelWith = (annots: ModelAnnotation[]): Model =>
    ({
      byId: Object.fromEntries(annots.map((annotation) => [annotation.id, annotation])),
      order: annots.map((annotation) => annotation.id),
    }) as unknown as Model;

  it('fromDTO maps a link DTO target onto the link slot', () => {
    const annotation = fromDTO(fromFile(linkDTO(20, URI)));
    expect(kindOf(annotation.annotation).name).toBe('link');
    expect(fieldsOf(annotation).link).toEqual(URI);
  });

  it('a grouped link child is SUBSTRATE: classified attached, read via linkOf', () => {
    const parent = fromDTO(fromFile(squareDTO(10)));
    const child = fromDTO(fromFile(linkDTO(11, URI, { to: parentRef, type: 'group' })));
    // Nothing folds — both are first-class model annotations…
    expect(isAttachedLink(parent)).toBe(false);
    expect(isAttachedLink(child)).toBe(true);
    const model = modelWith([parent, child]);
    // …and the parent's value derives from the committed child.
    expect(linkOf(model, parent.id)).toEqual(URI);
    expect(linkChildrenOf(model, parent.id).map((annotation) => annotation.id)).toEqual([child.id]);
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
    const model = modelWith([orphan]);
    expect(linkOf(model, 'obj:1')).toBe(null); // no children of that parent
    expect(isAttachedLink(orphan)).toBe(true);
  });

  it('multi-segment: several children, ONE derived value (first child wins)', () => {
    const parent = fromDTO(fromFile(squareDTO(10)));
    const c1 = fromDTO(fromFile(linkDTO(11, URI, { to: parentRef, type: 'group' })));
    const c2 = fromDTO(fromFile(linkDTO(12, URI, { to: parentRef, type: 'group' })));
    const model = modelWith([parent, c1, c2]);
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
    const rotated: ModelGeometry = {
      kind: 'box',
      box: { x: 100, y: 600, width: 100, height: 100 },
      ellipse: false,
      rotation: 45,
    };
    const [aabb] = linkChildRects(rotated, fieldsOf(square).style);
    const side = 100 * Math.SQRT2;
    expect(aabb.width).toBeCloseTo(side, 6);
    expect(aabb.height).toBeCloseTo(side, 6);
    expect(aabb.x + aabb.width / 2).toBeCloseTo(150, 6); // centre preserved
    expect(aabb.y + aabb.height / 2).toBeCloseTo(650, 6);
  });

  it('linkChildRects: one rect per markup quad, one visual-bounds rect otherwise', () => {
    const square = fromDTO(fromFile(squareDTO(10)));
    const { style } = fieldsOf(square);
    expect(linkChildRects(shapeOf(square.annotation), style)).toHaveLength(1);
    const quads: ModelGeometry = {
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

  it('toPatch on the link kind: writable target rides, null clears, read-only arms leave', () => {
    const base = { ...fromDTO(fromFile(linkDTO(20, URI))) };
    const patched = toFile(toPatch(fieldsOf(base)));
    expect(patched && 'target' in patched && patched.target).toEqual(URI);

    const dead = toFile(toPatch({ ...fieldsOf(base), link: null }));
    expect(dead && 'target' in dead && dead.target).toBeNull();

    const js = toFile(toPatch({ ...fieldsOf(base), link: { kind: 'javascript' } }));
    expect(js && !('target' in js)).toBe(true); // geometry-only: foreign /A survives
  });
});

describe('record — every field a kind takes writes only fields its engine kind has', () => {
  const PAGE = toPageRef(1);
  const box = { x: 100, y: 100, width: 80, height: 40 };
  const geometryOf = (subtype: string): RecordFields['geometry'] => {
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
        const before = record({
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
