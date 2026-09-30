import {
  toPageRef,
  type AnnotationDraft,
  type AnnotationDTO,
  type AnnotationPatch,
} from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { annotationAfter, annotationOfNew } from '../../src/record/written';

const PAGE = toPageRef(1);

/** The annotation `draft` creates, as the engine writes it. */
const created = (draft: Record<string, unknown>): AnnotationDTO =>
  annotationOfNew(draft as unknown as AnnotationDraft, {
    ref: { kind: 'nm', page: PAGE, nm: 'a' },
    index: 0,
  });

const LINE = {
  subtype: 'line',
  linePoints: { start: { x: 10, y: 20 }, end: { x: 110, y: 20 } },
  color: '#000000',
  strokeWidth: 4,
};

const SQUARE = {
  subtype: 'square',
  box: { x: 10, y: 10, width: 50, height: 40 },
  color: '#000000',
  strokeWidth: 2,
};

const LINK = { subtype: 'link', target: { kind: 'uri', uri: 'https://example.com' } };

/** From another app: its rect padded past its drawing on every side. */
const foreign = (annotation: AnnotationDTO): AnnotationDTO => {
  const { x, y, width, height } = annotation.rect;
  return { ...annotation, rect: { x: x - 3, y: y - 3, width: width + 6, height: height + 6 } };
};

const patch = (fields: Record<string, unknown>) => fields as unknown as AnnotationPatch;

describe('annotationOfNew', () => {
  it("a new line's rect is the box around its drawing: the line and half its stroke either side", () => {
    expect(created(LINE).rect).toEqual({ x: 10, y: 18, width: 100, height: 4 });
  });

  it("a new square's rect is its box: its border is drawn inside", () => {
    expect(created(SQUARE).rect).toEqual(SQUARE.box);
  });

  it("a new distance's rect holds its dimension line, leader lines and caption", () => {
    const distance = created({
      ...LINE,
      strokeWidth: 1,
      intent: 'line-dimension',
      leader: { length: 30, extension: 5, offset: 0 },
      captionEnabled: true,
      captionPosition: 'inline',
      contents: '1.00 m',
    });
    // The dimension line sits 30 above the measured points and the leaders
    // reach 5 past it; the leaders start on the points, butt-ended, so
    // nothing is painted below y = 20.
    expect(distance.rect.y).toBeLessThan(20 - 30);
    expect(distance.rect.y + distance.rect.height).toBeCloseTo(20, 5);
  });

  it('a link states its rect itself', () => {
    const rect = { x: 5, y: 5, width: 20, height: 10 };
    expect(created({ ...LINK, rect }).rect).toEqual(rect);
  });
});

describe('annotationAfter: the rect follows the engine’s verdict on the change', () => {
  it('nothing visible: the rect stays as it is, padding and all', () => {
    const square = foreign(created(SQUARE));
    const commented = annotationAfter(square, patch({ subtype: 'square', contents: 'note' }));
    expect(commented.rect).toEqual(square.rect);
  });

  it('a pure move: the rect moves the same distance, padding and all', () => {
    const square = foreign(created(SQUARE));
    const moved = annotationAfter(
      square,
      patch({ subtype: 'square', box: { ...SQUARE.box, x: SQUARE.box.x + 30 } }),
    );
    expect(moved.rect).toEqual({ ...square.rect, x: square.rect.x + 30 });
  });

  it('anything else visible: the rect is the box around the new drawing', () => {
    const thicker = annotationAfter(created(LINE), patch({ subtype: 'line', strokeWidth: 10 }));
    expect(thicker.rect).toEqual({ x: 10, y: 15, width: 100, height: 10 });
  });

  it('a restyled foreign drawing is drawn again by us: its padding goes', () => {
    const square = foreign(created(SQUARE));
    const recoloured = annotationAfter(square, patch({ subtype: 'square', color: '#ff0000' }));
    expect(recoloured.rect).toEqual(SQUARE.box);
  });

  it("a link's rect is its shape: it is what the patch says", () => {
    const link = created({ ...LINK, rect: { x: 5, y: 5, width: 20, height: 10 } });
    const rect = { x: 40, y: 5, width: 30, height: 10 };
    expect(annotationAfter(link, patch({ subtype: 'link', rect })).rect).toEqual(rect);
  });
});
