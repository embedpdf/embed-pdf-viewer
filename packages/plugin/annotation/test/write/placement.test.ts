import {
  anchoredGeom,
  anchorModeOf,
  initialModel,
  type BoxShape,
  type ViewEnv,
} from '@embedpdf/core-annotation';
import { describe, expect, it } from 'vitest';

import { iconAnnotationOf, iconPlaceAt } from '../../src/write/placement';

const PAGE = { width: 600, height: 800 };
const NOTE = iconAnnotationOf(initialModel, {
  subtype: 'text',
  preset: 'note',
  flags: { noZoom: true, noRotate: true },
});

const middleOf = (box: BoxShape['box']) => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2,
});

describe('placing an icon', () => {
  it('without a view, the rect is the icon centred on the point', () => {
    const { shown, rect } = iconPlaceAt(NOTE, { x: 300, y: 400 }, PAGE, undefined);
    expect(rect).toEqual({ x: 290, y: 390, width: 20, height: 20 });
    expect(shown).toEqual({ kind: 'box', box: rect, rotation: 0, ellipse: false });
  });

  it.each([
    [{ zoom: 1, rotation: 90 }],
    [{ zoom: 2, rotation: 90 }],
    [{ zoom: 2, rotation: 270 }],
    [{ zoom: 0.5, rotation: 180 }],
  ] as [ViewEnv][])(
    'at %o, it shows upright, centred on the point, where the ghost was',
    (view) => {
      const point = { x: 300, y: 400 };
      const { shown, rect } = iconPlaceAt(NOTE, point, PAGE, view);
      // Stored at its usual size...
      expect(rect.width).toBeCloseTo(20, 9);
      expect(rect.height).toBeCloseTo(20, 9);
      // ...it shows as the ghost did: centred on the point, turned back upright.
      expect(middleOf(shown.box).x).toBeCloseTo(point.x, 9);
      expect(middleOf(shown.box).y).toBeCloseTo(point.y, 9);
      expect(shown.rotation).toBe((360 - view.rotation) % 360);
      const placed = anchoredGeom(
        { kind: 'box', box: rect, rotation: 0, ellipse: false },
        anchorModeOf({ annotation: NOTE }),
        view,
      ) as BoxShape;
      expect(placed.rotation).toBe(shown.rotation);
      for (const key of ['x', 'y', 'width', 'height'] as const) {
        expect(placed.box[key]).toBeCloseTo(shown.box[key], 9);
      }
    },
  );

  it('stays on the page at its edge', () => {
    const { shown } = iconPlaceAt(NOTE, { x: 1, y: 1 }, PAGE, { zoom: 1, rotation: 90 });
    expect(shown.box.x).toBeGreaterThanOrEqual(0);
    expect(shown.box.y).toBeGreaterThanOrEqual(0);
  });
});
