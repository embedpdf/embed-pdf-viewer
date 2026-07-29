import { describe, expect, it } from 'vitest';

import { appearanceImpactOf, semanticEqual } from '../../src/shared';
import type { AnnotationDTO, WireAnnotationPatch } from '../../src/shared';

/* Minimal DTO/patch fixtures: the classifier only reads the fields it
 * compares, so tests cast focused literals rather than materialise the full
 * AnnotationBase envelope. */
const dto = (v: Record<string, unknown>): AnnotationDTO => v as unknown as AnnotationDTO;
const patch = (v: Record<string, unknown>): WireAnnotationPatch =>
  v as unknown as WireAnnotationPatch;

const rect = (left: number, bottom: number, right: number, top: number) => ({
  left,
  bottom,
  right,
  top,
});

/** A solid green square at (100,100)-(200,200) with the tri-state fields total. */
const squareDto = (over: Record<string, unknown> = {}) =>
  dto({
    subtype: 'square',
    rect: rect(100, 100, 200, 200),
    color: { r: 0, g: 128, b: 0 },
    interiorColor: null,
    opacity: 1,
    strokeWidth: 2,
    borderStyle: 'solid',
    cloudyIntensity: null,
    rectDifferences: null,
    ...over,
  });

/** The full-projection patch today's plugin emits for that square. */
const fullSquarePatch = (over: Record<string, unknown> = {}) =>
  patch({
    subtype: 'square',
    rect: rect(100, 100, 200, 200),
    color: { r: 0, g: 128, b: 0 },
    interiorColor: null,
    opacity: 1,
    strokeWidth: 2,
    borderStyle: 'solid',
    cloudyIntensity: null,
    rectDifferences: null,
    ...over,
  });

describe('semanticEqual', () => {
  it('treats null and undefined both as absence', () => {
    expect(semanticEqual(null, undefined)).toBe(true);
    expect(semanticEqual(null, null)).toBe(true);
    expect(semanticEqual(null, 0)).toBe(false);
  });

  it('compares numbers within the coordinate epsilon', () => {
    expect(semanticEqual(100, 100.0004)).toBe(true); // f32 round-trip drift
    expect(semanticEqual(100, 100.01)).toBe(false); // a real change
  });

  it('compares arrays and objects structurally', () => {
    expect(semanticEqual([{ x: 1, y: 2 }], [{ x: 1.0001, y: 2 }])).toBe(true);
    expect(semanticEqual([{ x: 1 }], [{ x: 1 }, { x: 2 }])).toBe(false);
  });
});

describe('appearanceImpactOf — value diffing (inert)', () => {
  it('a byte-identical full projection is inert', () => {
    expect(appearanceImpactOf(squareDto(), fullSquarePatch())).toBe('inert');
  });

  it('f32 float drift in a full projection is inert', () => {
    const p = fullSquarePatch({
      rect: rect(100.0001, 99.9999, 200.0001, 199.9999),
      opacity: 0.9999999,
    });
    expect(appearanceImpactOf(squareDto(), p)).toBe('inert');
  });

  it('metadata-only keys are inert (flags, relationships, grouping)', () => {
    const p = patch({
      subtype: 'square',
      flags: { hidden: true },
      inReplyTo: null,
      replyType: null,
    });
    expect(appearanceImpactOf(squareDto(), p)).toBe('inert');
  });

  it('tri-state: clearing an already-absent entry is a no-op', () => {
    // DTO totality states absence as null; a null-clear patch diffs away.
    expect(
      appearanceImpactOf(
        squareDto(),
        patch({ subtype: 'square', cloudyIntensity: null, rectDifferences: null }),
      ),
    ).toBe('inert');
  });

  it('contents is inert where it is popup text (square) but paints on free-text', () => {
    expect(
      appearanceImpactOf(squareDto(), patch({ subtype: 'square', contents: 'a comment' })),
    ).toBe('inert');
    const ft = dto({ subtype: 'free-text', rect: rect(0, 0, 10, 10), contents: 'old' });
    expect(appearanceImpactOf(ft, patch({ subtype: 'free-text', contents: 'new' }))).toBe(
      'regenerate',
    );
  });

  it('advisory rotation on the vertex family is inert; box rotation is not', () => {
    const poly = dto({
      subtype: 'polygon',
      rect: rect(0, 0, 100, 100),
      vertices: [
        { x: 10, y: 10 },
        { x: 90, y: 10 },
        { x: 50, y: 90 },
      ],
    });
    expect(appearanceImpactOf(poly, patch({ subtype: 'polygon', rotation: 45 }))).toBe('inert');
    expect(
      appearanceImpactOf(
        squareDto(),
        patch({ subtype: 'square', rotation: 45, rect: rect(100, 100, 200, 200) }),
      ),
    ).toBe('regenerate');
  });
});

describe('appearanceImpactOf — verified rigid translation', () => {
  it('a pure move inside a FULL projection classifies as translation', () => {
    // The exact real-world case: today's plugin ships every style key on a
    // drag. Unchanged values diff away; the remaining rect is a same-size move.
    const p = fullSquarePatch({ rect: rect(130, 80, 230, 180) });
    expect(appearanceImpactOf(squareDto(), p)).toBe('translation');
  });

  it('a resize is NOT a translation', () => {
    const p = fullSquarePatch({ rect: rect(100, 100, 210, 200) });
    expect(appearanceImpactOf(squareDto(), p)).toBe('regenerate');
  });

  it('a move combined with a real style change regenerates', () => {
    const p = fullSquarePatch({ rect: rect(130, 80, 230, 180), strokeWidth: 4 });
    expect(appearanceImpactOf(squareDto(), p)).toBe('regenerate');
  });

  it('polygon: rect + vertices shifted by one delta is a translation', () => {
    const poly = dto({
      subtype: 'polygon',
      rect: rect(0, 0, 100, 100),
      vertices: [
        { x: 10, y: 10 },
        { x: 90, y: 10 },
        { x: 50, y: 90 },
      ],
    });
    const moved = patch({
      subtype: 'polygon',
      rect: rect(5, -7, 105, 93),
      vertices: [
        { x: 15, y: 3 },
        { x: 95, y: 3 },
        { x: 55, y: 83 },
      ],
    });
    expect(appearanceImpactOf(poly, moved)).toBe('translation');
  });

  it('polygon: a rect move that leaves vertices behind regenerates', () => {
    const poly = dto({
      subtype: 'polygon',
      rect: rect(0, 0, 100, 100),
      vertices: [{ x: 10, y: 10 }],
    });
    expect(
      appearanceImpactOf(poly, patch({ subtype: 'polygon', rect: rect(5, -7, 105, 93) })),
    ).toBe('regenerate');
  });

  it('ink: strokes shifted by a mismatched delta regenerate (congruence rejection)', () => {
    const ink = dto({
      subtype: 'ink',
      rect: rect(0, 0, 100, 100),
      inkList: [
        [
          { x: 10, y: 10 },
          { x: 20, y: 20 },
        ],
      ],
    });
    const skewed = patch({
      subtype: 'ink',
      rect: rect(10, 10, 110, 110),
      inkList: [
        [
          { x: 20, y: 20 },
          { x: 31, y: 30 }, // second point shifted by (11,10), not (10,10)
        ],
      ],
    });
    expect(appearanceImpactOf(ink, skewed)).toBe('regenerate');
    const rigid = patch({
      subtype: 'ink',
      rect: rect(10, 10, 110, 110),
      inkList: [
        [
          { x: 20, y: 20 },
          { x: 30, y: 30 },
        ],
      ],
    });
    expect(appearanceImpactOf(ink, rigid)).toBe('translation');
  });

  it('text markup: rect + quadPoints riding one delta is a translation', () => {
    const hl = dto({
      subtype: 'highlight',
      rect: rect(0, 0, 100, 20),
      quadPoints: [
        {
          p1: { x: 0, y: 20 },
          p2: { x: 100, y: 20 },
          p3: { x: 0, y: 0 },
          p4: { x: 100, y: 0 },
        },
      ],
    });
    const moved = patch({
      subtype: 'highlight',
      rect: rect(0, -30, 100, -10),
      quadPoints: [
        {
          p1: { x: 0, y: -10 },
          p2: { x: 100, y: -10 },
          p3: { x: 0, y: -30 },
          p4: { x: 100, y: -30 },
        },
      ],
    });
    expect(appearanceImpactOf(hl, moved)).toBe('translation');
  });

  it('rotated box: translation must carry the transform group unchanged + shifted', () => {
    const rotated = squareDto({ rotation: 90, unrotatedRect: rect(100, 100, 200, 200) });
    // rect moved but rotation omitted -> the writer would CLEAR the rotation
    // metadata; that is an appearance change even though no key "changed".
    expect(
      appearanceImpactOf(rotated, patch({ subtype: 'square', rect: rect(110, 100, 210, 200) })),
    ).toBe('regenerate');
    // the full group riding the same delta is a translation
    const moved = patch({
      subtype: 'square',
      rect: rect(110, 100, 210, 200),
      rotation: 90,
      unrotatedRect: rect(110, 100, 210, 200),
    });
    expect(appearanceImpactOf(rotated, moved)).toBe('translation');
  });

  it('free-text callout: rect + calloutLine + box translate together', () => {
    const callout = dto({
      subtype: 'free-text',
      rect: rect(0, 0, 300, 100),
      calloutLine: [
        { x: 10, y: 10 },
        { x: 80, y: 40 },
        { x: 170, y: 40 },
      ],
      contents: 'hi',
    });
    const moved = patch({
      subtype: 'free-text',
      rect: rect(20, 10, 320, 110),
      calloutLine: [
        { x: 30, y: 20 },
        { x: 100, y: 50 },
        { x: 190, y: 50 },
      ],
      contents: 'hi',
    });
    expect(appearanceImpactOf(callout, moved)).toBe('translation');
  });

  it('tri-state clears that remove a real entry regenerate', () => {
    const cloudy = squareDto({
      cloudyIntensity: 2,
      rectDifferences: { left: 9, top: 9, right: 9, bottom: 9 },
    });
    expect(
      appearanceImpactOf(
        cloudy,
        patch({ subtype: 'square', cloudyIntensity: null, rectDifferences: null }),
      ),
    ).toBe('regenerate');
  });

  it('an epsilon-scale move is inert, a sub-visible-but-real move is a translation', () => {
    expect(
      appearanceImpactOf(
        squareDto(),
        fullSquarePatch({ rect: rect(100.0005, 100, 200.0005, 200) }),
      ),
    ).toBe('inert');
    expect(
      appearanceImpactOf(squareDto(), fullSquarePatch({ rect: rect(100.1, 100, 200.1, 200) })),
    ).toBe('translation');
  });

  it('a subtype mismatch is conservatively regenerate', () => {
    expect(
      appearanceImpactOf(squareDto(), patch({ subtype: 'circle', rect: rect(0, 0, 1, 1) })),
    ).toBe('regenerate');
  });
});
