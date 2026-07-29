import { describe, expect, it } from 'vitest';
import type {
  AnnotationDraft,
  AnnotationDTO,
  AnnotationFlags,
  AnnotationPatch,
  AnnotationRef,
  CalloutLine,
  PdfRect,
} from '@embedpdf/engine-core/runtime';
import { DRAWN_FLAGS, type Annot } from '@embedpdf/core-annotation';
import {
  foldAttachedLinks,
  fromDTO,
  linkChildRects,
  refKey,
  toCreateDraft,
  toPatch,
} from './repository';

const CROP: PdfRect = { left: 0, bottom: 0, right: 600, top: 800 };

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
  rel?: { inReplyTo: AnnotationRef | null; replyType: 'reply' | 'group' | null },
): AnnotationDTO {
  const ref: AnnotationRef = { kind: 'objectNumber', pageObjectNumber: 1, annotObjectNumber };
  return {
    ref,
    pageObjectNumber: 1,
    index: 0,
    identityQuality: 'durable',
    nm: null,
    flags: NO_FLAGS,
    rect: { left: 100, bottom: 100, right: 200, top: 200 },
    contents: null,
    author: null,
    created: null,
    modified: null,
    blendMode: 'normal',
    inReplyTo: rel?.inReplyTo ?? null,
    replyType: rel?.replyType ?? null,
    subtype: 'square',
    color: { r: 0, g: 0, b: 0 },
    interiorColor: null,
    strokeWidth: 2,
    opacity: 1,
    borderStyle: 'solid',
  } as AnnotationDTO;
}

describe('repository.fromDTO — group/relationship mapping', () => {
  it('leaves irt/group undefined for a top-level annotation', () => {
    const a = fromDTO(squareDTO(10), CROP);
    expect(a.irt).toBeUndefined();
    expect(a.group).toBeUndefined();
  });

  it('maps a `/RT /Group` subordinate to both irt and group (the primary key)', () => {
    const primary: AnnotationRef = {
      kind: 'objectNumber',
      pageObjectNumber: 1,
      annotObjectNumber: 10,
    };
    const sub = fromDTO(squareDTO(11, { inReplyTo: primary, replyType: 'group' }), CROP);
    expect(sub.irt).toBe(refKey(primary));
    expect(sub.group).toBe(refKey(primary)); // visual group → acts as a unit
  });

  it('maps a `/RT /R` comment reply to irt only, NOT group (not a visual group)', () => {
    const parent: AnnotationRef = {
      kind: 'objectNumber',
      pageObjectNumber: 1,
      annotObjectNumber: 10,
    };
    const reply = fromDTO(squareDTO(12, { inReplyTo: parent, replyType: 'reply' }), CROP);
    expect(reply.irt).toBe(refKey(parent));
    expect(reply.group).toBeUndefined();
  });
});

describe('repository — Ink Highlight intent and blend', () => {
  const dto = (): AnnotationDTO => ({
    ref: { kind: 'objectNumber', pageObjectNumber: 1, annotObjectNumber: 20 },
    pageObjectNumber: 1,
    index: 0,
    identityQuality: 'durable',
    nm: null,
    flags: NO_FLAGS,
    rect: { left: 10, bottom: 740, right: 120, top: 760 },
    contents: null,
    author: null,
    created: null,
    modified: null,
    blendMode: 'multiply',
    inReplyTo: null,
    replyType: null,
    subtype: 'ink',
    intent: 'ink-highlight',
    color: { r: 255, g: 205, b: 69 },
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
    const annotation = fromDTO(dto(), CROP, 'vector');
    expect(annotation.intent).toBe('ink-highlight');
    expect(annotation.style.blendMode).toBe('multiply');
    expect(toCreateDraft(annotation, CROP)).toMatchObject({
      subtype: 'ink',
      intent: 'ink-highlight',
      blendMode: 'multiply',
    });
    expect(toPatch(annotation, CROP)).toMatchObject({
      subtype: 'ink',
      intent: 'ink-highlight',
      blendMode: 'multiply',
    });
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
    const caret: Annot = {
      id: 'tmp:1',
      ref: null,
      pon: 1,
      subtype: 'caret',
      intent: 'replace',
      geom: { t: 'caret', rect: { x: 90, y: 40, width: 10, height: 10 } },
      style,
      flags: DRAWN_FLAGS,
      source: 'vector',
    };
    const strikeout: Annot = {
      id: 'tmp:2',
      ref: null,
      pon: 1,
      subtype: 'strikeout',
      intent: 'strikeout-text-edit',
      geom: {
        t: 'quads',
        quads: [
          [
            { x: 10, y: 20 },
            { x: 90, y: 20 },
            { x: 10, y: 35 },
            { x: 90, y: 35 },
          ],
        ],
      },
      style,
      flags: DRAWN_FLAGS,
      source: 'vector',
      irt: caret.id,
      group: caret.id,
    };

    expect(toCreateDraft(caret, CROP)).toMatchObject({
      subtype: 'caret',
      intent: 'replace',
      flags: { print: true },
      rectDifferences: { left: 0.5, top: 0.5, right: 0.5, bottom: 0.5 },
    });
    expect(toCreateDraft(strikeout, CROP)).toMatchObject({
      subtype: 'strikeout',
      intent: 'strikeout-text-edit',
      flags: { print: true },
    });
  });
});

/* ── callout free-text round-trip ─────────────────────────────────────────────
 * Coordinates are PDF user space (y-up). With this CROP, content = (x, 800 - y).
 * The text box PDF rect is {200,600,320,660}; the overall /Rect {30,590,330,745}
 * encloses the box + the leader (tip 40,740; knee 120,700) + the arrow; `/RD`
 * recovers the box from the overall. The 3rd `/CL` point (the connection) is
 * authored arbitrarily — the reader ignores it and re-derives off the box.
 */
const BOX_PDF: PdfRect = { left: 200, bottom: 600, right: 320, top: 660 };
const OVERALL_PDF: PdfRect = { left: 30, bottom: 590, right: 330, top: 745 };
const CL: CalloutLine = [
  { x: 40, y: 740 }, // tip
  { x: 120, y: 700 }, // knee
  { x: 200, y: 630 }, // connection (ignored on read)
];

function calloutDTO(annotObjectNumber = 20): AnnotationDTO {
  const ref: AnnotationRef = { kind: 'objectNumber', pageObjectNumber: 1, annotObjectNumber };
  return {
    ref,
    pageObjectNumber: 1,
    index: 0,
    identityQuality: 'durable',
    nm: null,
    flags: NO_FLAGS,
    rect: OVERALL_PDF,
    contents: 'see here',
    author: null,
    created: null,
    modified: null,
    blendMode: 'normal',
    inReplyTo: null,
    replyType: null,
    subtype: 'free-text',
    intent: 'free-text-callout',
    fontFamily: 'helvetica',
    fontSize: 14,
    textAlign: 'left',
    color: { r: 200, g: 0, b: 0 },
    interiorColor: null,
    opacity: 1,
    strokeWidth: 1,
    borderStyle: 'solid',
    rectDifferences: {
      left: BOX_PDF.left - OVERALL_PDF.left, // 170
      bottom: BOX_PDF.bottom - OVERALL_PDF.bottom, // 10
      right: OVERALL_PDF.right - BOX_PDF.right, // 10
      top: OVERALL_PDF.top - BOX_PDF.top, // 85
    },
    calloutLine: CL,
    lineEnding: 'open-arrow',
  } as AnnotationDTO;
}

/** A plain free-text DTO (no leader) for the contrast case. */
function plainFreeTextDTO(annotObjectNumber = 21): AnnotationDTO {
  return {
    ...calloutDTO(annotObjectNumber),
    intent: 'free-text',
    rect: BOX_PDF,
    rectDifferences: null,
    calloutLine: undefined,
    lineEnding: undefined,
  } as AnnotationDTO;
}

/* ── rotation round-trip (CW content ↔ PDF convention) ────────────────────────
 * The model carries `rot` CLOCKWISE in content space; the engine DTO carries
 * `/EMBD_Metadata/Rotation` in PDF convention. The repository converts ONCE at
 * this seam: `rot_content = -rotation_pdf (mod 360)` and back. Box kinds also
 * split `/Rect` (the rotated AABB) from `unrotatedRect` (the logical box); vertex
 * kinds keep an advisory scalar only (the points are already rotated).
 */
function rotatedSquareDTO(rotationPdf: number, annotObjectNumber = 30): AnnotationDTO {
  return {
    ...squareDTO(annotObjectNumber),
    // /Rect is the rotated AABB; for a square turned 90° it equals the box.
    rect: { left: 100, bottom: 100, right: 200, top: 200 },
    rotation: rotationPdf,
    unrotatedRect: { left: 100, bottom: 100, right: 200, top: 200 },
  } as AnnotationDTO;
}

function rotatedPolylineDTO(rotationPdf: number, annotObjectNumber = 31): AnnotationDTO {
  const ref: AnnotationRef = { kind: 'objectNumber', pageObjectNumber: 1, annotObjectNumber };
  return {
    ref,
    pageObjectNumber: 1,
    index: 0,
    identityQuality: 'durable',
    nm: null,
    flags: NO_FLAGS,
    rect: { left: 100, bottom: 100, right: 300, top: 300 },
    contents: null,
    author: null,
    created: null,
    modified: null,
    blendMode: 'normal',
    inReplyTo: null,
    replyType: null,
    subtype: 'polyline',
    color: { r: 0, g: 0, b: 0 },
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
    rotation: rotationPdf,
  } as AnnotationDTO;
}

describe('repository — rotation round-trip', () => {
  it('box: fromDTO reads unrotatedRect + converts PDF→CW content rot', () => {
    const a = fromDTO(rotatedSquareDTO(90), CROP);
    if (a.geom.t !== 'rect') throw new Error('expected rect geom');
    // unrotatedRect {100,100,200,200} → content {x:100,y:600,w:100,h:100}
    expect(a.geom.rect).toMatchObject({ x: 100, y: 600, width: 100, height: 100 });
    // PDF 90° → CW content 270° (negation mod 360, from the y-flip)
    expect(a.geom.rot).toBe(270);
  });

  it('box: toPatch emits rect(AABB) + unrotatedRect + rotation (CW→PDF back)', () => {
    const patch = toPatch(fromDTO(rotatedSquareDTO(90), CROP), CROP) as Extract<
      AnnotationPatch,
      { subtype: 'square' }
    > & { rotation?: number; unrotatedRect?: PdfRect };
    if (!patch) throw new Error('expected a patch');
    expect(patch.rotation).toBe(90); // round-trips back to the PDF angle
    expect(patch.unrotatedRect).toMatchObject({ left: 100, bottom: 100, right: 200, top: 200 });
    // the square turned a quarter-turn still spans the same AABB
    if (!patch.rect) throw new Error('expected a rect');
    expect(patch.rect.left).toBeCloseTo(100);
    expect(patch.rect.right).toBeCloseTo(200);
  });

  it('box: an unrotated DTO states the transform clears explicitly (total projection)', () => {
    const patch = toPatch(fromDTO(squareDTO(32), CROP), CROP) as Extract<
      AnnotationPatch,
      { subtype: 'square' }
    > & { rotation?: number | null; unrotatedRect?: PdfRect | null };
    if (!patch) throw new Error('expected a patch');
    // Tri-state writes preserve omitted fields, so rotation 0 must be STATED
    // as null — omission would keep a stale rotation on the document.
    expect(patch.rotation).toBe(null);
    expect(patch.unrotatedRect).toBe(null);
  });

  it('vertex: advisory rotation round-trips and the points stay authoritative', () => {
    const a = fromDTO(rotatedPolylineDTO(30), CROP);
    if (a.geom.t !== 'poly') throw new Error('expected poly geom');
    expect(a.geom.rot).toBe(330); // -30 mod 360
    // the points are the visual — first vertex maps straight through the y-flip
    expect(a.geom.points[0]).toEqual({ x: 120, y: 680 });

    const patch = toPatch(a, CROP) as Extract<AnnotationPatch, { subtype: 'polyline' }> & {
      rotation?: number;
      unrotatedRect?: PdfRect;
    };
    if (!patch) throw new Error('expected a patch');
    expect(patch.rotation).toBe(30); // back to the PDF angle
    expect(patch).not.toHaveProperty('unrotatedRect'); // vertex kinds never carry one
    expect(patch.vertices?.[0]).toMatchObject({ x: 120, y: 120 });
  });

  it('vertex: an unrotated polyline states the advisory clear explicitly', () => {
    const a = fromDTO(rotatedPolylineDTO(0, 33), CROP);
    expect(a.geom.t === 'poly' && a.geom.rot).toBeFalsy();
    const patch = toPatch(a, CROP) as Extract<AnnotationPatch, { subtype: 'polyline' }> & {
      rotation?: number | null;
    };
    expect(patch?.rotation).toBe(null);
  });
});

describe('repository — free-text callout mapping', () => {
  it('fromDTO: intent + /CL + /RD → a text geom with a leader (box recovered, conn dropped)', () => {
    const a = fromDTO(calloutDTO(), CROP);
    expect(a.geom.t).toBe('text');
    if (a.geom.t !== 'text' || !a.geom.callout) throw new Error('expected callout geom');
    // text box = overall inset by /RD, in content space
    expect(a.geom.rect).toMatchObject({ x: 200, y: 140, width: 120, height: 60 });
    // tip / knee map to content space (y flips about the 800-pt crop)
    expect(a.geom.callout.tip).toEqual({ x: 40, y: 60 });
    expect(a.geom.callout.knee).toEqual({ x: 120, y: 100 });
    expect(a.geom.callout.ending).toBe('open-arrow');
  });

  it('fromDTO: a plain free-text (no /CL) has no callout', () => {
    const a = fromDTO(plainFreeTextDTO(), CROP);
    expect(a.geom.t).toBe('text');
    expect(a.geom.t === 'text' && a.geom.callout).toBeUndefined();
  });

  it('toCreateDraft: a callout geom → intent + overall /Rect + /CL + /RD + /LE', () => {
    const draft = toCreateDraft(fromDTO(calloutDTO(), CROP), CROP) as Extract<
      AnnotationDraft,
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
    // the overall /Rect reaches the tip (x≈40) and still covers the box (right≈320)
    expect(draft.rect.left).toBeLessThanOrEqual(40);
    expect(draft.rect.right).toBeGreaterThanOrEqual(320);
    expect(draft.rect.top).toBeGreaterThanOrEqual(740); // y-up: the tip is the high edge
    // every /RD inset is non-negative (the box is inside the overall)
    const rd = draft.rectDifferences!;
    expect(rd.left).toBeGreaterThanOrEqual(0);
    expect(rd.right).toBeGreaterThanOrEqual(0);
    expect(rd.top).toBeGreaterThanOrEqual(0);
    expect(rd.bottom).toBeGreaterThanOrEqual(0);
  });

  it('toCreateDraft: a plain free-text → intent free-text + the box as /Rect (no leader)', () => {
    const draft = toCreateDraft(fromDTO(plainFreeTextDTO(), CROP), CROP) as Extract<
      AnnotationDraft,
      { subtype: 'free-text' }
    >;
    expect(draft.intent).toBe('free-text');
    expect(draft.calloutLine).toBeUndefined();
    expect(draft.rect).toMatchObject(BOX_PDF);
  });

  it('toPatch: a callout sends the overall /Rect + /CL + /RD + /LE together', () => {
    const patch = toPatch(fromDTO(calloutDTO(), CROP), CROP) as Extract<
      AnnotationPatch,
      { subtype: 'free-text' }
    > | null;
    if (!patch) throw new Error('expected a patch');
    expect(patch.calloutLine).toHaveLength(3);
    expect(patch.lineEnding).toBe('open-arrow');
    expect(patch.rectDifferences).toBeDefined();
    expect(patch.rect!.left).toBeLessThanOrEqual(40);
  });
});

describe('repository — free-text style + font round-trip', () => {
  it('fromDTO projects the /DA font fields into `text` (fontColor falls back to /DA colour)', () => {
    const a = fromDTO(calloutDTO(), CROP);
    expect(a.text).toEqual({
      fontFamily: 'helvetica',
      fontSize: 14,
      fontColor: '#c80000', // no explicit fontColor → the /DA colour {200,0,0}
      textAlign: 'left',
    });
  });

  it('toPatch carries the FULL style + font set for free-text (a sidebar edit round-trips)', () => {
    const a = fromDTO(plainFreeTextDTO(), CROP);
    // a props edit: restyle + refont the box (what updateSelection applies)
    const edited = {
      ...a,
      style: { ...a.style, color: '#0000ff', interiorColor: '#ffff00', opacity: 0.5 },
      text: { ...a.text!, fontSize: 22, fontColor: '#00ff00', textAlign: 'center' as const },
    };
    const patch = toPatch(edited, CROP) as Extract<AnnotationPatch, { subtype: 'free-text' }>;
    expect(patch.color).toEqual({ r: 0, g: 0, b: 255 });
    expect(patch.interiorColor).toEqual({ r: 255, g: 255, b: 0 });
    expect(patch.opacity).toBe(0.5);
    expect(patch.fontSize).toBe(22);
    expect(patch.fontColor).toEqual({ r: 0, g: 255, b: 0 });
    expect(patch.textAlign).toBe('center');
    expect(patch.fontFamily).toBe('helvetica');
    // contents is owned by the debounced text-edit write — never duplicated here
    expect(patch).not.toHaveProperty('contents');
  });

  it('toPatch carries style + font for a callout too, alongside the leader fields', () => {
    const a = fromDTO(calloutDTO(), CROP);
    const edited = { ...a, text: { ...a.text!, fontFamily: 'courier' } };
    const patch = toPatch(edited, CROP) as Extract<AnnotationPatch, { subtype: 'free-text' }>;
    expect(patch.calloutLine).toHaveLength(3); // geometry still round-trips
    expect(patch.fontFamily).toBe('courier');
    expect(patch.strokeWidth).toBe(1);
  });

  it('toCreateDraft seeds the draft from `text` (the tool font defaults), not hardcoded values', () => {
    const a = fromDTO(plainFreeTextDTO(), CROP);
    const seeded = { ...a, text: { ...a.text!, fontSize: 18, textAlign: 'right' as const } };
    const draft = toCreateDraft(seeded, CROP) as Extract<AnnotationDraft, { subtype: 'free-text' }>;
    expect(draft.fontSize).toBe(18);
    expect(draft.textAlign).toBe('right');
    expect(draft.contents).toBe('see here');
  });
});

/* ── polygon cloudy border round-trip ─────────────────────────────────────────
 * A polygon's cloud curls are generated from /Vertices + /BE alone (no /RD; the
 * curls reach OUTWARD), so the patch must carry `cloudyIntensity` and a /Rect
 * grown by the cloud extent — the regression here was a patch with NEITHER, so
 * the engine round-trip snapped the border back to solid.
 */
function polygonDTO(cloudyIntensity: number | undefined, annotObjectNumber = 40): AnnotationDTO {
  const ref: AnnotationRef = { kind: 'objectNumber', pageObjectNumber: 1, annotObjectNumber };
  return {
    ref,
    pageObjectNumber: 1,
    index: 0,
    identityQuality: 'durable',
    nm: null,
    flags: NO_FLAGS,
    rect: { left: 100, bottom: 100, right: 300, top: 300 },
    contents: null,
    author: null,
    created: null,
    modified: null,
    blendMode: 'normal',
    inReplyTo: null,
    replyType: null,
    subtype: 'polygon',
    color: { r: 0, g: 0, b: 0 },
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
  } as AnnotationDTO;
}

describe('repository — polygon cloudy border', () => {
  it('fromDTO reads /BE intensity into a cloudy border', () => {
    const a = fromDTO(polygonDTO(2), CROP);
    expect(a.style.border).toEqual({ kind: 'cloudy', intensity: 2 });
  });

  it('toPatch carries cloudyIntensity and grows /Rect by the outward cloud extent', () => {
    const a = fromDTO(polygonDTO(2), CROP);
    const patch = toPatch(a, CROP) as Extract<AnnotationPatch, { subtype: 'polygon' }>;
    expect(patch.cloudyIntensity).toBe(2);
    // vertex hull is x:[120,280]; the /Rect must reach beyond it by the cloud
    // radius (4·intensity + 0.5·stroke) + stroke/2 = 8 + 1 + 1 = 10
    expect(patch.rect!.left).toBeLessThanOrEqual(120 - 9);
    expect(patch.rect!.right).toBeGreaterThanOrEqual(280 + 9);
    // no /RD for polygons — the curls are derived from /Vertices + /BE alone
    expect(patch).not.toHaveProperty('rectDifferences');
  });

  it('toPatch clears the effect with cloudyIntensity null when the border is solid again', () => {
    const a = fromDTO(polygonDTO(2), CROP);
    const solid = { ...a, style: { ...a.style, border: { kind: 'solid' as const } } };
    const patch = toPatch(solid, CROP) as Extract<AnnotationPatch, { subtype: 'polygon' }>;
    expect(patch.cloudyIntensity).toBe(null); // tri-state remove of /BE
    // and the /Rect shrinks back to the stroke-only bounds
    expect(patch.rect!.left).toBeGreaterThanOrEqual(118);
  });

  it('an open polyline never carries cloudy fields', () => {
    const a = fromDTO(rotatedPolylineDTO(0, 41), CROP);
    const cloudyStyled = {
      ...a,
      style: { ...a.style, border: { kind: 'cloudy' as const, intensity: 2 } },
    };
    const patch = toPatch(cloudyStyled, CROP) as Extract<AnnotationPatch, { subtype: 'polyline' }>;
    expect(patch).not.toHaveProperty('cloudyIntensity');
  });
});

describe('repository — shape cloudy border tri-state', () => {
  const cloudySquare = (annotObjectNumber = 45): AnnotationDTO =>
    ({
      ...squareDTO(annotObjectNumber),
      cloudyIntensity: 2,
      rectDifferences: { left: 9, top: 9, right: 9, bottom: 9 },
    }) as AnnotationDTO;

  it('fromDTO reads /BE intensity into a cloudy border', () => {
    expect(fromDTO(cloudySquare(), CROP).style.border).toEqual({ kind: 'cloudy', intensity: 2 });
  });

  it('toPatch on a cloudy square carries /BE + a derived /RD inset', () => {
    const patch = toPatch(fromDTO(cloudySquare(), CROP), CROP) as Extract<
      AnnotationPatch,
      { subtype: 'square' }
    >;
    expect(patch.cloudyIntensity).toBe(2);
    expect(patch.rectDifferences).toBeDefined();
    expect(patch.rectDifferences!.left).toBeGreaterThan(0);
  });

  it('toPatch states BOTH clears when the border is solid again (no stale /RD)', () => {
    const a = fromDTO(cloudySquare(), CROP);
    const solid = { ...a, style: { ...a.style, border: { kind: 'solid' as const } } };
    const patch = toPatch(solid, CROP) as Extract<AnnotationPatch, { subtype: 'square' }>;
    // Tri-state removes: /BE and /RD are stated as null, never omitted — an
    // omitted rectDifferences preserves the stale inset (the Adobe phantom
    // padding this projection used to leave behind).
    expect(patch.cloudyIntensity).toBe(null);
    expect(patch.rectDifferences).toBe(null);
  });
});

describe('repository — attached links (fold + desired state + link kind mapping)', () => {
  const linkDTO = (
    annotObjectNumber: number,
    target: import('@embedpdf/engine-core/runtime').PdfLinkTarget | null,
    rel?: { inReplyTo: AnnotationRef; replyType: 'group' | 'reply' },
  ): AnnotationDTO =>
    ({
      ...squareDTO(
        annotObjectNumber,
        rel ? { inReplyTo: rel.inReplyTo, replyType: rel.replyType } : undefined,
      ),
      subtype: 'link',
      target,
    }) as unknown as AnnotationDTO;

  const URI = { kind: 'uri', uri: 'https://www.embedpdf.com/' } as const;
  const parentRef: AnnotationRef = {
    kind: 'objectNumber',
    pageObjectNumber: 1,
    annotObjectNumber: 10,
  };

  it('fromDTO maps a link DTO target onto the link slot', () => {
    const a = fromDTO(linkDTO(20, URI), CROP);
    expect(a.subtype).toBe('link');
    expect(a.link).toEqual(URI);
  });

  it('folds a grouped link child onto its linkable parent and removes it', () => {
    const parent = fromDTO(squareDTO(10), CROP);
    const child = fromDTO(linkDTO(11, URI, { inReplyTo: parentRef, replyType: 'group' }), CROP);
    const out = foldAttachedLinks([parent, child]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(parent.id);
    expect(out[0].link).toEqual(URI);
    expect(out[0].linkRefs?.map(refKey)).toEqual([refKey(child.ref!)]);
  });

  it('does NOT fold onto non-linkable parents (widgets) or other links — orphans stay standalone', () => {
    const widget = { ...fromDTO(squareDTO(10), CROP), subtype: 'widget-text' };
    const child = fromDTO(linkDTO(11, URI, { inReplyTo: parentRef, replyType: 'group' }), CROP);
    const orphan = fromDTO(
      linkDTO(12, URI, {
        inReplyTo: { kind: 'objectNumber', pageObjectNumber: 1, annotObjectNumber: 99 },
        replyType: 'group',
      }),
      CROP,
    );
    const out = foldAttachedLinks([widget, child, orphan]);
    expect(out).toHaveLength(3); // nothing folded, nothing hidden
  });

  it('multi-segment: several children fold to ONE link value + all join keys', () => {
    const parent = fromDTO(squareDTO(10), CROP);
    const c1 = fromDTO(linkDTO(11, URI, { inReplyTo: parentRef, replyType: 'group' }), CROP);
    const c2 = fromDTO(linkDTO(12, URI, { inReplyTo: parentRef, replyType: 'group' }), CROP);
    const out = foldAttachedLinks([parent, c1, c2]);
    expect(out).toHaveLength(1);
    expect(out[0].linkRefs).toHaveLength(2);
  });

  it('linkChildRects: a ROTATED parent gets the AABB of its rotated footprint, not the unrotated box', () => {
    const square = fromDTO(squareDTO(10), CROP);
    // 100×100 box (from the DTO rect) with a 45° tilt: the rotated
    // footprint's AABB is 100·√2 ≈ 141.42 per side, centred on the box
    // centre — NOT the 100×100 unrotated box. (Stroke handling follows
    // `selectionQuad`'s own convention — the same envelope the chrome
    // outlines.)
    const rotated: Annot = {
      ...square,
      geom: {
        t: 'rect',
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
    const square = fromDTO(squareDTO(10), CROP);
    expect(linkChildRects(square)).toHaveLength(1);
    const markup: Annot = {
      ...square,
      subtype: 'highlight',
      geom: {
        t: 'quads',
        quads: [
          [
            { x: 0, y: 0 },
            { x: 50, y: 0 },
            { x: 0, y: 10 },
            { x: 50, y: 10 },
          ],
          [
            { x: 0, y: 20 },
            { x: 30, y: 20 },
            { x: 0, y: 30 },
            { x: 30, y: 30 },
          ],
        ],
      },
    };
    const rects = linkChildRects(markup);
    expect(rects).toHaveLength(2);
    expect(rects[0]).toEqual({ x: 0, y: 0, width: 50, height: 10 });
  });

  it('toPatch on the link kind: writable target rides, null clears, read-only arms leave', () => {
    const base = { ...fromDTO(linkDTO(20, URI), CROP) };
    const patched = toPatch(base, CROP);
    expect(patched && 'target' in patched && patched.target).toEqual(URI);

    const dead = toPatch({ ...base, link: null }, CROP);
    expect(dead && 'target' in dead && dead.target).toBeNull();

    const js = toPatch({ ...base, link: { kind: 'javascript' } }, CROP);
    expect(js && !('target' in js)).toBe(true); // geometry-only: foreign /A survives
  });
});
