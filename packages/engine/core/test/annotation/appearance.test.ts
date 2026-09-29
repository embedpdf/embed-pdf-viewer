import { describe, expect, it } from 'vitest';

import { appearanceImpactOf, semanticEqual } from '../../src/shared';
import type { AnnotationDTO, AnnotationPatch } from '../../src/shared';
import type { PdfCoordinates } from '../../src/pageSpace/coordinates';

/* Minimal DTO/patch fixtures: the classifier only reads the fields it
 * compares, so tests cast focused literals rather than materialise the full
 * AnnotationBase envelope. */
const dto = (v: Record<string, unknown>): AnnotationDTO<PdfCoordinates> =>
  v as unknown as AnnotationDTO<PdfCoordinates>;
const patch = (v: Record<string, unknown>): AnnotationPatch<PdfCoordinates> =>
  v as unknown as AnnotationPatch<PdfCoordinates>;

const rect = (left: number, bottom: number, right: number, top: number) => ({
  left,
  bottom,
  right,
  top,
});

describe('measurement appearance impact', () => {
  it.each(['line', 'polyline', 'polygon'])(
    'contents paints only when the %s caption is enabled',
    (subtype) => {
      const change = patch({ subtype, contents: '6 m' });
      expect(
        appearanceImpactOf(dto({ subtype, contents: '3 m', captionEnabled: true }), change),
      ).toBe('regenerate');
      expect(
        appearanceImpactOf(dto({ subtype, contents: '3 m', captionEnabled: false }), change),
      ).toBe('inert');
      expect(appearanceImpactOf(dto({ subtype, contents: '3 m' }), change)).toBe('inert');
    },
  );
  it('a shape translation preserves pixels only when its manual caption also moves', () => {
    const current = dto({
      subtype: 'polygon',
      rect: rect(0, 0, 100, 100),
      vertices: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
      captionEnabled: true,
      captionCenter: { x: 50, y: 20 },
    });
    const moved = {
      subtype: 'polygon',
      vertices: [
        { x: 10, y: 20 },
        { x: 110, y: 20 },
        { x: 110, y: 120 },
      ],
    };
    expect(appearanceImpactOf(current, patch(moved))).toBe('regenerate');
    expect(appearanceImpactOf(current, patch({ ...moved, captionCenter: { x: 60, y: 40 } }))).toBe(
      'translation',
    );
    expect(
      appearanceImpactOf(
        current,
        patch({ ...moved, captionEnabled: false, captionCenter: { x: 60, y: 40 } }),
      ),
    ).toBe('regenerate');
  });
});

/** A solid green square at (100,100)-(200,200) with the tri-state fields total. */
const squareDto = (over: Record<string, unknown> = {}) =>
  dto({
    subtype: 'square',
    rect: rect(100, 100, 200, 200),
    box: rect(100, 100, 200, 200),
    rotation: null,
    color: '#008000',
    interiorColor: null,
    opacity: 1,
    strokeWidth: 2,
    borderStyle: 'solid',
    cloudyIntensity: null,
    ...over,
  });

/** The full-projection patch today's plugin emits for that square. */
const fullSquarePatch = (over: Record<string, unknown> = {}) =>
  patch({
    subtype: 'square',
    box: rect(100, 100, 200, 200),
    color: '#008000',
    interiorColor: null,
    opacity: 1,
    strokeWidth: 2,
    borderStyle: 'solid',
    cloudyIntensity: null,
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
      box: rect(100.0001, 99.9999, 200.0001, 199.9999),
      opacity: 0.9999999,
    });
    expect(appearanceImpactOf(squareDto(), p)).toBe('inert');
  });

  it('fields a write accepts but never applies are inert, so a read can be sent back', () => {
    const p = patch({
      subtype: 'square',
      page: { kind: 'objectNumber', pageObjectNumber: 3 },
      index: 7,
      identityQuality: 'durable',
      author: 'Someone else',
      modifiedAt: '2026-01-01T00:00:00Z',
      userId: 'u_other',
      importedBy: null,
      popup: null,
      actions: null,
    });
    expect(appearanceImpactOf(squareDto(), p)).toBe('inert');
  });

  it('metadata-only keys are inert (flags, relationships, grouping)', () => {
    const p = patch({
      subtype: 'square',
      hidden: true,
      reply: null,
    });
    expect(appearanceImpactOf(squareDto(), p)).toBe('inert');
  });

  it('conversation-plane keys are inert (subject, review state)', () => {
    // /Subj is dictionary-only on every kind.
    expect(
      appearanceImpactOf(squareDto(), patch({ subtype: 'square', subject: 'Pricing question' })),
    ).toBe('inert');
    // /State + /StateModel live on a text annotation whose AP is baked
    // from /C + /Name alone — a status change never repaints anything.
    const note = dto({ subtype: 'text', rect: rect(0, 0, 20, 20), icon: 'note' });
    expect(
      appearanceImpactOf(note, patch({ subtype: 'text', state: 'accepted', stateModel: 'review' })),
    ).toBe('inert');
  });

  it('tri-state: clearing an already-absent entry is a no-op', () => {
    // DTO totality states absence as null; a null-clear patch diffs away.
    expect(
      appearanceImpactOf(squareDto(), patch({ subtype: 'square', cloudyIntensity: null })),
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

  it('a turn draws a polygon again, as it does a box', () => {
    const poly = dto({
      subtype: 'polygon',
      rect: rect(0, 0, 100, 100),
      vertices: [
        { x: 10, y: 10 },
        { x: 90, y: 10 },
        { x: 50, y: 90 },
      ],
    });
    expect(appearanceImpactOf(poly, patch({ subtype: 'polygon', rotation: 45 }))).toBe(
      'regenerate',
    );
    expect(
      appearanceImpactOf(
        squareDto(),
        patch({ subtype: 'square', rotation: 45, box: rect(100, 100, 200, 200) }),
      ),
    ).toBe('regenerate');
  });
});

describe('appearanceImpactOf — verified rigid translation', () => {
  it('a pure move inside a FULL projection classifies as translation', () => {
    // The exact real-world case: today's plugin ships every style key on a
    // drag. Unchanged values diff away; the remaining box is a same-size move.
    const p = fullSquarePatch({ box: rect(130, 80, 230, 180) });
    expect(appearanceImpactOf(squareDto(), p)).toBe('translation');
  });

  it('a resize is NOT a translation', () => {
    const p = fullSquarePatch({ box: rect(100, 100, 210, 200) });
    expect(appearanceImpactOf(squareDto(), p)).toBe('regenerate');
  });

  it('a move combined with a real style change regenerates', () => {
    const p = fullSquarePatch({ box: rect(130, 80, 230, 180), strokeWidth: 4 });
    expect(appearanceImpactOf(squareDto(), p)).toBe('regenerate');
  });

  it('polygon: vertices shifted by one delta are a translation', () => {
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
      vertices: [
        { x: 15, y: 3 },
        { x: 95, y: 3 },
        { x: 55, y: 83 },
      ],
    });
    expect(appearanceImpactOf(poly, moved)).toBe('translation');
  });

  it('polygon: a rect alone is not a move (the engine works it out from the vertices)', () => {
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
      inkList: [
        [
          { x: 20, y: 20 },
          { x: 30, y: 30 },
        ],
      ],
    });
    expect(appearanceImpactOf(ink, rigid)).toBe('translation');
  });

  it('text markup: quadPoints riding one delta are a translation', () => {
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

  it('turned box: a move of the box that keeps its turn is a translation', () => {
    const turned = squareDto({ rotation: 90, rect: rect(100, 100, 200, 200) });
    // The rotation omitted is kept (tri-state), so the box alone moves it.
    expect(
      appearanceImpactOf(turned, patch({ subtype: 'square', box: rect(110, 100, 210, 200) })),
    ).toBe('translation');
    // Stated unchanged, the same.
    const moved = patch({ subtype: 'square', box: rect(110, 100, 210, 200), rotation: 90 });
    expect(appearanceImpactOf(turned, moved)).toBe('translation');
    // A new turn draws it again.
    const spun = patch({ subtype: 'square', box: rect(110, 100, 210, 200), rotation: 45 });
    expect(appearanceImpactOf(turned, spun)).toBe('regenerate');
  });

  it('free-text callout: box + calloutLine translate together', () => {
    const callout = dto({
      subtype: 'free-text',
      rect: rect(0, 0, 300, 100),
      box: rect(150, 0, 300, 100),
      calloutLine: [
        { x: 10, y: 10 },
        { x: 80, y: 40 },
        { x: 170, y: 40 },
      ],
      contents: 'hi',
    });
    const moved = patch({
      subtype: 'free-text',
      box: rect(170, 10, 320, 110),
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
    const cloudy = squareDto({ cloudyIntensity: 2, rect: rect(91, 91, 209, 209) });
    expect(appearanceImpactOf(cloudy, patch({ subtype: 'square', cloudyIntensity: null }))).toBe(
      'regenerate',
    );
  });

  it('rotation: null on an upright shape diffs away on a move', () => {
    // Upright shapes emit `rotation: null` — null on an absent entry is a
    // no-op, so a pure move still verifies as a translation and preserves /AP.
    const p = fullSquarePatch({ box: rect(130, 80, 230, 180), rotation: null });
    expect(appearanceImpactOf(squareDto(), p)).toBe('translation');
  });

  it('clearing a REAL rotation during a move regenerates', () => {
    const rotated = squareDto({ rotation: 90 });
    const p = patch({ subtype: 'square', box: rect(110, 100, 210, 200), rotation: null });
    expect(appearanceImpactOf(rotated, p)).toBe('regenerate');
  });

  it('an epsilon-scale move is inert, a sub-visible-but-real move is a translation', () => {
    expect(
      appearanceImpactOf(squareDto(), fullSquarePatch({ box: rect(100.0005, 100, 200.0005, 200) })),
    ).toBe('inert');
    expect(
      appearanceImpactOf(squareDto(), fullSquarePatch({ box: rect(100.1, 100, 200.1, 200) })),
    ).toBe('translation');
  });

  it('a subtype mismatch is conservatively regenerate', () => {
    expect(
      appearanceImpactOf(squareDto(), patch({ subtype: 'circle', box: rect(0, 0, 1, 1) })),
    ).toBe('regenerate');
  });
});
