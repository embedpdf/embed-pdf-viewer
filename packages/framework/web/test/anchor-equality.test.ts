import { describe, expect, it } from 'vitest';

import {
  sameAnnotationAnchor,
  sameCreationDraftAnchor,
  samePageBounds,
  sameRotationAnchor,
  sameSelectionAnchor,
  sameSelectionEndpoints,
} from '../src/anchor-equality';

const page = { objectNumber: 3 };
const bounds = { x: 1, y: 2, width: 3, height: 4 };

describe('anchor equality', () => {
  it('compares a page box by value, and null only with null', () => {
    expect(
      samePageBounds({ page, bounds }, { page: { objectNumber: 3 }, bounds: { ...bounds } }),
    ).toBe(true);
    expect(samePageBounds({ page, bounds }, { page, bounds: { ...bounds, x: 9 } })).toBe(false);
    expect(samePageBounds({ page, bounds }, { page: { objectNumber: 4 }, bounds })).toBe(false);
    expect(samePageBounds(null, null)).toBe(true);
    expect(samePageBounds({ page, bounds }, null)).toBe(false);
  });

  it('sees a moved rotation handle, a new view-dependent box, and a draft that grew', () => {
    const selection = { page, bounds, rotationHandle: { x: 1, y: 1 } };
    expect(sameSelectionAnchor(selection, { ...selection })).toBe(true);
    expect(sameSelectionAnchor(selection, { ...selection, rotationHandle: { x: 1, y: 2 } })).toBe(
      false,
    );
    expect(sameSelectionAnchor(selection, { page, bounds })).toBe(false);

    const boundsIn = () => null;
    expect(sameAnnotationAnchor({ page, bounds, boundsIn }, { page, bounds, boundsIn })).toBe(true);
    expect(
      sameAnnotationAnchor({ page, bounds, boundsIn }, { page, bounds, boundsIn: () => null }),
    ).toBe(false);

    const draft = {
      page,
      bounds,
      kind: 'poly',
      subtype: 'polygon',
      pointCount: 2,
      minPoints: 3,
      canFinish: false,
    };
    expect(sameCreationDraftAnchor(draft, { ...draft })).toBe(true);
    expect(sameCreationDraftAnchor(draft, { ...draft, pointCount: 3, canFinish: true })).toBe(
      false,
    );
  });

  it('compares a turn by its pointer and angle', () => {
    const turn = { page, at: { x: 1, y: 1 }, angle: 15 };
    expect(sameRotationAnchor(turn, { ...turn, at: { x: 1, y: 1 } })).toBe(true);
    expect(sameRotationAnchor(turn, { ...turn, angle: 30 })).toBe(false);
  });

  it('sees a selection end that turned without moving its bounding box', () => {
    const quad = {
      upperLeft: { x: 0, y: 0 },
      upperRight: { x: 1, y: 0 },
      lowerLeft: { x: 0, y: 1 },
      lowerRight: { x: 1, y: 1 },
    };
    const end = { page, glyphQuad: quad, advance: 'after' };
    const ends = { start: end, end };
    expect(sameSelectionEndpoints(ends, { start: { ...end }, end: { ...end } })).toBe(true);
    const turned = {
      upperLeft: quad.lowerLeft,
      upperRight: quad.upperLeft,
      lowerLeft: quad.lowerRight,
      lowerRight: quad.upperRight,
    };
    expect(sameSelectionEndpoints(ends, { start: end, end: { ...end, glyphQuad: turned } })).toBe(
      false,
    );
  });
});
