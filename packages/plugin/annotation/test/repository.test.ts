import {
  DRAWN_FLAGS,
  isAttachedLink,
  linkChildrenOf,
  linkOf,
  type ModelAnnotation,
  type Model,
} from '@embedpdf/core-annotation';
import { textQuadFromRect } from '@embedpdf/core-geometry';
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
  pageAnnotationOf,
  pdfAnnotationDraftOf,
  pdfAnnotationPatchOf,
  pdfPointTurned,
  pdfTurnOfUpright,
  toPageRef,
} from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import {
  fromDTO,
  linkChildRects,
  annotationKey,
  toCreateDraft,
  toPatch,
  toScopedPatch,
} from '../src/repository';

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
  annotObjectNumber: number,
  reply: { to: AnnotationRef; type: 'reply' | 'group' } | null = null,
): AnnotationDTO<PdfCoordinates> {
  const ref: AnnotationRef = {
    kind: 'objectNumber',
    page: toPageRef(1),
    objectNumber: annotObjectNumber,
  };
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

describe('repository.fromDTO — group/relationship mapping', () => {
  it('leaves irt/group undefined for a top-level annotation', () => {
    const annotation = fromDTO(fromFile(squareDTO(10)));
    expect(annotation.irt).toBeUndefined();
    expect(annotation.group).toBeUndefined();
  });

  it('maps a `/RT /Group` subordinate to both irt and group (the primary key)', () => {
    const primary: AnnotationRef = {
      kind: 'objectNumber',
      page: toPageRef(1),
      objectNumber: 10,
    };
    const sub = fromDTO(fromFile(squareDTO(11, { to: primary, type: 'group' })));
    expect(sub.irt).toBe(annotationKey(primary));
    expect(sub.group).toBe(annotationKey(primary)); // visual group → acts as a unit
  });

  it('maps a `/RT /R` comment reply to irt only, NOT group (not a visual group)', () => {
    const parent: AnnotationRef = {
      kind: 'objectNumber',
      page: toPageRef(1),
      objectNumber: 10,
    };
    const reply = fromDTO(fromFile(squareDTO(12, { to: parent, type: 'reply' })));
    expect(reply.irt).toBe(annotationKey(parent));
    expect(reply.group).toBeUndefined();
  });
});

describe('repository — Ink Highlight intent and blend', () => {
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
    expect(annotation.intent).toBe('ink-highlight');
    expect(annotation.style.blendMode).toBe('multiply');
    expect(draftToFile(toCreateDraft(annotation))).toMatchObject({
      subtype: 'ink',
      intent: 'ink-highlight',
      blendMode: 'multiply',
    });
    // `/IT` is a create-only statement: patches don't restate it (the engine's
    // tri-state law preserves what a patch omits), so only the draft carries it.
    const patch = toFile(toPatch(annotation)) as Record<string, unknown> | null;
    expect(patch).toMatchObject({ subtype: 'ink', blendMode: 'multiply' });
    expect(patch).not.toHaveProperty('intent');
  });
});

describe('repository — Replace Text authoring', () => {
  const style = {
    color: '#e44234',
    interiorColor: null,
    strokeWidth: 1,
    opacity: 1,
    blendMode: 'normal' as const,
    border: { kind: 'solid' as const },
  };

  it('emits the normalized Caret and StrikeOut intents with print flags', () => {
    const caret: ModelAnnotation = {
      id: 'tmp:1',
      ref: null,
      page: toPageRef(1),
      subtype: 'caret',
      intent: 'replace',
      geometry: { kind: 'caret', rect: { x: 90, y: 40, width: 10, height: 10 } },
      style,
      flags: DRAWN_FLAGS,
      source: 'vector',
    };
    const strikeout: ModelAnnotation = {
      id: 'tmp:2',
      ref: null,
      page: toPageRef(1),
      subtype: 'strikeout',
      intent: 'strikeout-text-edit',
      geometry: {
        kind: 'quads',
        quads: [textQuadFromRect({ x: 10, y: 20, width: 80, height: 15 })],
      },
      style,
      flags: DRAWN_FLAGS,
      source: 'vector',
      irt: caret.id,
      group: caret.id,
    };

    expect(draftToFile(toCreateDraft(caret))).toMatchObject({
      subtype: 'caret',
      intent: 'replace',
      print: true,
      box: { left: 90, right: 100, bottom: 750, top: 760 },
    });
    expect(draftToFile(toCreateDraft(strikeout))).toMatchObject({
      subtype: 'strikeout',
      intent: 'strikeout-text-edit',
      print: true,
    });
  });

  it('a rotated caret emits its box and its turn', () => {
    const caret: ModelAnnotation = {
      id: 'tmp:3',
      ref: null,
      page: toPageRef(1),
      subtype: 'caret',
      geometry: { kind: 'caret', rect: { x: 94, y: 53, width: 6, height: 6 }, rot: 270 },
      style,
      flags: DRAWN_FLAGS,
      source: 'vector',
    };
    // Clockwise 270° passes through with the box; the engine works out `rect`.
    const draft = draftToFile(toCreateDraft(caret));
    expect(draft).toMatchObject({
      subtype: 'caret',
      rotation: 270,
      box: { left: 94, right: 100, bottom: 741, top: 747 },
    });
    expect(draft).not.toHaveProperty('rect');

    if (caret.geometry.kind !== 'caret') throw new Error('Expected caret projection');
    const upright: ModelAnnotation = {
      ...caret,
      geometry: { kind: 'caret', rect: caret.geometry.rect },
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

function calloutDTO(annotObjectNumber = 20): AnnotationDTO<PdfCoordinates> {
  const ref: AnnotationRef = {
    kind: 'objectNumber',
    page: toPageRef(1),
    objectNumber: annotObjectNumber,
  };
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
function plainFreeTextDTO(annotObjectNumber = 21): AnnotationDTO<PdfCoordinates> {
  return {
    ...calloutDTO(annotObjectNumber),
    intent: 'free-text',
    rect: BOX_PDF,
    calloutLine: null,
    lineEnding: null,
  } as AnnotationDTO<PdfCoordinates>;
}

/* ── rotation round-trip ───────────────────────────────────────────────────────
 * The model's `rot` and the engine DTO's `rotation` are both degrees clockwise,
 * so the repository passes the angle through. Box kinds carry their `box`
 * before the turn (`rect` is the engine's upright box around it); vertex
 * kinds keep an advisory scalar only (the points are already rotated).
 */
function rotatedSquareDTO(rotation: number, annotObjectNumber = 30): AnnotationDTO<PdfCoordinates> {
  return {
    ...squareDTO(annotObjectNumber),
    // For a square turned 90° the upright box around it is the box itself.
    rect: { left: 100, bottom: 100, right: 200, top: 200 },
    rotation,
  } as AnnotationDTO<PdfCoordinates>;
}

function rotatedPolylineDTO(
  rotation: number,
  annotObjectNumber = 31,
): AnnotationDTO<PdfCoordinates> {
  const ref: AnnotationRef = {
    kind: 'objectNumber',
    page: toPageRef(1),
    objectNumber: annotObjectNumber,
  };
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

describe('repository — rotation round-trip', () => {
  it('box: fromDTO reads the box and the clockwise rot', () => {
    const annotation = fromDTO(fromFile(rotatedSquareDTO(90)));
    if (annotation.geometry.kind !== 'rect') throw new Error('expected rect geom');
    // box {100,100,200,200} → content {x:100,y:600,w:100,h:100}
    expect(annotation.geometry.rect).toMatchObject({ x: 100, y: 600, width: 100, height: 100 });
    expect(annotation.geometry.rot).toBe(90);
  });

  it('box: toPatch emits the box + rotation, and no rect', () => {
    const patch = toFile(toPatch(fromDTO(fromFile(rotatedSquareDTO(90))))) as Extract<
      AnnotationPatch<PdfCoordinates>,
      { subtype?: 'square' }
    >;
    if (!patch) throw new Error('expected a patch');
    expect(patch.rotation).toBe(90);
    expect(patch.box).toMatchObject({ left: 100, bottom: 100, right: 200, top: 200 });
    expect(patch).not.toHaveProperty('rect');
  });

  it('box: an unrotated DTO states the turn clear explicitly (total projection)', () => {
    const patch = toFile(toPatch(fromDTO(fromFile(squareDTO(32))))) as Extract<
      AnnotationPatch<PdfCoordinates>,
      { subtype?: 'square' }
    >;
    if (!patch) throw new Error('expected a patch');
    // Tri-state writes preserve omitted fields, so rotation 0 must be stated
    // as null — omission would keep a stale rotation on the document.
    expect(patch.rotation).toBe(null);
  });

  it('vertex: the upright points are turned onto the page and turned back on the way out', () => {
    const dto = rotatedPolylineDTO(30);
    if (dto.subtype !== 'polyline') throw new Error('expected polyline');
    const annotation = fromDTO(fromFile(dto));
    if (annotation.geometry.kind !== 'poly') throw new Error('expected poly geom');
    expect(annotation.geometry.rot).toBe(30);
    // The model keeps the points as drawn: the upright ones turned about their box's middle.
    const drawn = pdfPointTurned(dto.vertices[0]!, pdfTurnOfUpright(dto.vertices, 30));
    expect(annotation.geometry.points[0]!.x).toBeCloseTo(drawn.x - CROP.left, 9);
    expect(annotation.geometry.points[0]!.y).toBeCloseTo(CROP.top - drawn.y, 9);

    const patch = toFile(toPatch(annotation)) as Extract<
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
    expect(annotation.geometry.kind === 'poly' && annotation.geometry.rot).toBeFalsy();
    const patch = toFile(toPatch(annotation)) as Extract<
      AnnotationPatch<PdfCoordinates>,
      { subtype?: 'polyline' }
    > & {
      rotation?: number | null;
    };
    expect(patch?.rotation).toBe(null);
  });
});

describe('repository — free-text callout mapping', () => {
  it('fromDTO: intent + /CL → a text geom with a leader (the box, conn dropped)', () => {
    const annotation = fromDTO(fromFile(calloutDTO()));
    expect(annotation.geometry.kind).toBe('text');
    if (annotation.geometry.kind !== 'text' || !annotation.geometry.callout)
      throw new Error('expected callout geom');
    // the text box, in page space
    expect(annotation.geometry.rect).toMatchObject({ x: 200, y: 140, width: 120, height: 60 });
    // tip / knee map to page space (y flips about the 800-pt crop)
    expect(annotation.geometry.callout.tip).toEqual({ x: 40, y: 60 });
    expect(annotation.geometry.callout.knee).toEqual({ x: 120, y: 100 });
    expect(annotation.geometry.callout.ending).toBe('open-arrow');
  });

  it('fromDTO: a plain free-text (no /CL) has no callout', () => {
    const annotation = fromDTO(fromFile(plainFreeTextDTO()));
    expect(annotation.geometry.kind).toBe('text');
    expect(annotation.geometry.kind === 'text' && annotation.geometry.callout).toBeUndefined();
  });

  it('toCreateDraft: a callout geom → intent + the text box + /CL + /LE', () => {
    const draft = draftToFile(toCreateDraft(fromDTO(fromFile(calloutDTO())))) as Extract<
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
    const draft = draftToFile(toCreateDraft(fromDTO(fromFile(plainFreeTextDTO())))) as Extract<
      AnnotationDraft<PdfCoordinates>,
      { subtype: 'free-text' }
    >;
    expect(draft.intent).toBe('free-text');
    expect(draft.calloutLine).toBeUndefined();
    expect(draft.box).toMatchObject(BOX_PDF);
  });

  it('toPatch: a callout sends the text box + /CL + /LE together', () => {
    const patch = toFile(toPatch(fromDTO(fromFile(calloutDTO())))) as Extract<
      AnnotationPatch<PdfCoordinates>,
      { subtype?: 'free-text' }
    > | null;
    if (!patch) throw new Error('expected a patch');
    expect(patch.calloutLine).toHaveLength(3);
    expect(patch.lineEnding).toBe('open-arrow');
    expect(patch.box).toMatchObject(BOX_PDF);
  });
});

describe('repository — free-text style + font round-trip', () => {
  it('fromDTO projects the text fields into `text`: fontColor is the text, never the border', () => {
    const annotation = fromDTO(fromFile(calloutDTO()));
    expect(annotation.text).toEqual({
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
      ...annotation,
      style: { ...annotation.style, color: '#0000ff', interiorColor: '#ffff00', opacity: 0.5 },
      text: {
        ...annotation.text!,
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
    const edited = { ...annotation, text: { ...annotation.text!, fontFamily: 'courier' } };
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
      ...annotation,
      text: { ...annotation.text!, fontSize: 18, textAlign: 'right' as const },
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
  annotObjectNumber = 40,
): AnnotationDTO<PdfCoordinates> {
  const ref: AnnotationRef = {
    kind: 'objectNumber',
    page: toPageRef(1),
    objectNumber: annotObjectNumber,
  };
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

describe('repository — polygon cloudy border', () => {
  it('fromDTO reads /BE intensity into a cloudy border', () => {
    const annotation = fromDTO(fromFile(polygonDTO(2)));
    expect(annotation.style.border).toEqual({ kind: 'cloudy', intensity: 2 });
  });

  it('toPatch carries cloudyIntensity and no rect: the engine measures the curls', () => {
    const annotation = fromDTO(fromFile(polygonDTO(2)));
    const patch = toFile(toPatch(annotation)) as Extract<
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
      ...annotation,
      style: { ...annotation.style, border: { kind: 'solid' as const } },
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
      ...annotation,
      style: { ...annotation.style, border: { kind: 'cloudy' as const, intensity: 2 } },
    };
    const patch = toFile(toPatch(cloudyStyled)) as Extract<
      AnnotationPatch<PdfCoordinates>,
      { subtype?: 'polyline' }
    >;
    expect(patch).not.toHaveProperty('cloudyIntensity');
  });
});

describe('repository — toScopedPatch (sparse emission)', () => {
  it('geometry scope on a square emits ONLY the box group (no style biography)', () => {
    const annotation = fromDTO(fromFile(squareDTO(60)));
    const patch = toFile(toScopedPatch(annotation, { kind: 'geometry' })) as unknown as Record<
      string,
      unknown
    >;
    // the box + its total turn — and nothing else.
    expect(Object.keys(patch).sort()).toEqual(['box', 'rotation', 'subtype']);
    expect(patch.rotation).toBe(null);
    expect(patch).not.toHaveProperty('color');
    expect(patch).not.toHaveProperty('strokeWidth');
    expect(patch).not.toHaveProperty('cloudyIntensity');
  });

  it('geometry scope on a link omits target — a foreign /A survives the move', () => {
    const annotation = fromDTO(
      fromFile({ ...squareDTO(61), subtype: 'link' } as AnnotationDTO<PdfCoordinates>),
    );
    const patch = toFile(toScopedPatch(annotation, { kind: 'geometry' })) as unknown as Record<
      string,
      unknown
    >;
    expect(patch.subtype).toBe('link');
    expect(patch).not.toHaveProperty('target');
  });

  it('props scope lowers single keys 1:1 (fontSize alone, engine RMW makes it safe)', () => {
    const annotation = fromDTO(fromFile(calloutDTO(21)));
    const patch = toFile(
      toScopedPatch(annotation, { kind: 'props', keys: ['fontSize'] }),
    ) as unknown as Record<string, unknown>;
    expect(Object.keys(patch).sort()).toEqual(['fontSize', 'subtype']);
  });

  it('props strokeWidth on a CLOUDY square states the box the cloud leaves', () => {
    const cloudy = fromDTO(
      fromFile({ ...squareDTO(62), cloudyIntensity: 2 } as AnnotationDTO<PdfCoordinates>),
    );
    const patch = toFile(
      toScopedPatch(cloudy, { kind: 'props', keys: ['strokeWidth'] }),
    ) as unknown as Record<string, unknown>;
    expect(patch.strokeWidth).toBe(2);
    // The cloud's reach follows the stroke width, so the box is stated again.
    const box = patch.box as PdfRect;
    expect(box.left).toBeCloseTo(100);
    expect(box.right).toBeCloseTo(200);
  });

  it('props strokeWidth on a polygon sends no rect: the engine measures the stroke', () => {
    const annotation = fromDTO(fromFile(polygonDTO(undefined)));
    const patch = toFile(
      toScopedPatch(annotation, { kind: 'props', keys: ['strokeWidth'] }),
    ) as unknown as Record<string, unknown>;
    expect(patch.strokeWidth).toBeDefined();
    expect(patch).not.toHaveProperty('rect');
  });

  it('props border on a plain square states the tri-state clears', () => {
    const annotation = fromDTO(fromFile(squareDTO(63)));
    const patch = toFile(
      toScopedPatch(annotation, { kind: 'props', keys: ['border'] }),
    ) as unknown as Record<string, unknown>;
    expect(patch.borderStyle).toBe('solid');
    expect(patch.cloudyIntensity).toBe(null);
    expect(patch.box).toMatchObject({ left: 100, bottom: 100, right: 200, top: 200 });
    expect(patch).not.toHaveProperty('color');
  });

  it('props opacity on a stamp reads and lowers /CA alone (the engine re-bakes it)', () => {
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
    expect(stamp.style.opacity).toBe(0.3);
    const patch = toFile(
      toScopedPatch(
        { ...stamp, style: { ...stamp.style, opacity: 0.6 } },
        { kind: 'props', keys: ['opacity'] },
      ),
    ) as unknown as Record<string, unknown>;
    expect(patch).toEqual({ subtype: 'stamp', opacity: 0.6 });
  });

  it('an unlowerable key degrades to the FULL projection, never a dropped write', () => {
    const annotation = fromDTO(fromFile(squareDTO(64)));
    const sparse = toFile(
      toScopedPatch(annotation, { kind: 'props', keys: ['color'] }),
    ) as unknown as Record<string, unknown>;
    expect(Object.keys(sparse).sort()).toEqual(['color', 'subtype']);
    // `lineEndings` is not lowerable for a rect geom — full fallback kicks in.
    const fallback = toFile(
      toScopedPatch(annotation, { kind: 'props', keys: ['color', 'lineEndings'] }),
    ) as unknown as Record<string, unknown>;
    expect(fallback.strokeWidth).toBeDefined(); // the full projection's signature
    expect(fallback.opacity).toBeDefined();
  });
});

describe('repository — line endings leave /Rect to the engine', () => {
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

  it('props lineEndings on a line sends the endings and no rect: the engine measures the arrows', () => {
    const none = fromDTO(fromFile(lineDTO({ start: 'none', end: 'none' })));
    // The model after the reducer applied the user's gesture: arrows on both ends.
    const arrows = {
      ...none,
      geometry: { ...none.geometry, ends: { start: 'open-arrow', end: 'open-arrow' } },
    } as typeof none;
    const patch = toFile(
      toScopedPatch(arrows, { kind: 'props', keys: ['lineEndings'] }),
    ) as RectPatch;
    expect(patch.lineEndings).toEqual({ start: 'open-arrow', end: 'open-arrow' });
    expect(patch).not.toHaveProperty('rect');
  });

  it('polyline endings send no rect either', () => {
    const base = fromDTO(fromFile(rotatedPolylineDTO(0, 78)));
    const arrows = {
      ...base,
      geometry: { ...base.geometry, ends: { start: 'closed-arrow', end: 'closed-arrow' } },
    } as typeof base;
    const patch = toFile(
      toScopedPatch(arrows, { kind: 'props', keys: ['lineEndings'] }),
    ) as RectPatch;
    expect(patch.lineEndings).toBeDefined();
    expect(patch).not.toHaveProperty('rect');
  });
});

describe('repository — shape cloudy border tri-state', () => {
  const cloudySquare = (annotObjectNumber = 45): AnnotationDTO<PdfCoordinates> =>
    ({ ...squareDTO(annotObjectNumber), cloudyIntensity: 2 }) as AnnotationDTO<PdfCoordinates>;

  it('fromDTO reads /BE intensity into a cloudy border, the model box around the cloud', () => {
    const annotation = fromDTO(fromFile(cloudySquare()));
    expect(annotation.style.border).toEqual({ kind: 'cloudy', intensity: 2 });
    // The model keeps the outer box: the engine's box grown by the cloud's reach.
    if (annotation.geometry.kind !== 'rect') throw new Error('expected rect geom');
    expect(annotation.geometry.rect.x).toBeLessThan(100);
    expect(annotation.geometry.rect.width).toBeGreaterThan(100);
  });

  it('toPatch on a cloudy square carries /BE and the box the cloud starts from', () => {
    const patch = toFile(toPatch(fromDTO(fromFile(cloudySquare())))) as Extract<
      AnnotationPatch<PdfCoordinates>,
      { subtype?: 'square' }
    >;
    expect(patch.cloudyIntensity).toBe(2);
    expect(patch.box!.left).toBeCloseTo(100);
    expect(patch.box!.top).toBeCloseTo(200);
  });

  it('toPatch states the clear when the border is solid again, and the box fills the model box', () => {
    const annotation = fromDTO(fromFile(cloudySquare()));
    const solid = {
      ...annotation,
      style: { ...annotation.style, border: { kind: 'solid' as const } },
    };
    const patch = toFile(toPatch(solid)) as Extract<
      AnnotationPatch<PdfCoordinates>,
      { subtype?: 'square' }
    >;
    // Tri-state remove: /BE is stated as null, never omitted.
    expect(patch.cloudyIntensity).toBe(null);
    expect(patch.box!.left).toBeLessThan(100);
  });
});

describe('repository — attached links (fold + desired state + link kind mapping)', () => {
  const linkDTO = (
    annotObjectNumber: number,
    target: import('@embedpdf/engine-core/runtime').PdfLinkTarget | null,
    reply?: { to: AnnotationRef; type: 'group' | 'reply' },
  ): AnnotationDTO<PdfCoordinates> =>
    ({
      ...squareDTO(annotObjectNumber, reply ?? null),
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
    expect(annotation.subtype).toBe('link');
    expect(annotation.link).toEqual(URI);
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
    const rotated: ModelAnnotation = {
      ...square,
      geometry: {
        kind: 'rect',
        rect: { x: 100, y: 600, width: 100, height: 100 },
        ellipse: false,
        rot: 45,
      },
    };
    const [aabb] = linkChildRects(rotated);
    const side = 100 * Math.SQRT2;
    expect(aabb.width).toBeCloseTo(side, 6);
    expect(aabb.height).toBeCloseTo(side, 6);
    expect(aabb.x + aabb.width / 2).toBeCloseTo(150, 6); // centre preserved
    expect(aabb.y + aabb.height / 2).toBeCloseTo(650, 6);
  });

  it('linkChildRects: one rect per markup quad, one visual-bounds rect otherwise', () => {
    const square = fromDTO(fromFile(squareDTO(10)));
    expect(linkChildRects(square)).toHaveLength(1);
    const markup: ModelAnnotation = {
      ...square,
      subtype: 'highlight',
      geometry: {
        kind: 'quads',
        quads: [
          textQuadFromRect({ x: 0, y: 0, width: 50, height: 10 }),
          textQuadFromRect({ x: 0, y: 20, width: 30, height: 10 }),
        ],
      },
    };
    const rects = linkChildRects(markup);
    expect(rects).toHaveLength(2);
    expect(rects[0]).toEqual({ x: 0, y: 0, width: 50, height: 10 });
  });

  it('toPatch on the link kind: writable target rides, null clears, read-only arms leave', () => {
    const base = { ...fromDTO(fromFile(linkDTO(20, URI))) };
    const patched = toFile(toPatch(base));
    expect(patched && 'target' in patched && patched.target).toEqual(URI);

    const dead = toFile(toPatch({ ...base, link: null }));
    expect(dead && 'target' in dead && dead.target).toBeNull();

    const js = toFile(toPatch({ ...base, link: { kind: 'javascript' } }));
    expect(js && !('target' in js)).toBe(true); // geometry-only: foreign /A survives
  });
});
