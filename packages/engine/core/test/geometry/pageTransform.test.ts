import { describe, expect, it } from 'vitest';

import { EngineErrorCode } from '../../src/errors/EngineErrorCode';
import type { PageBox, PagePoint } from '../../src/geometry/pageSpace';
import { pageTransform, renderTargetArea } from '../../src/geometry/pageTransform';
import type { PdfRotation } from '../../src/geometry/primitives';

const LETTER = { size: { width: 612, height: 792 } };

const close = (a: PagePoint, b: PagePoint) => {
  expect(a.x).toBeCloseTo(b.x, 9);
  expect(a.y).toBeCloseTo(b.y, 9);
};

const closeBox = (a: PageBox, b: PageBox) => {
  close(a, b);
  expect(a.width).toBeCloseTo(b.width, 9);
  expect(a.height).toBeCloseTo(b.height, 9);
};

describe('pageTransform', () => {
  it('has the size a render with the same settings has, rounding included', () => {
    const view = pageTransform(LETTER, { viewport: { kind: 'width', width: 800 } });
    expect([view.width, view.height]).toEqual([800, 1035]);
    expect(pageTransform(LETTER)).toMatchObject({ width: 612, height: 792 });
    expect(pageTransform(LETTER, { viewport: { kind: 'scale', scale: 2 } })).toMatchObject({
      width: 1224,
      height: 1584,
    });
  });

  it('stretches the page onto the rounded size, each axis on its own', () => {
    const view = pageTransform(LETTER, { viewport: { kind: 'width', width: 800 } });
    close(view.pageToPixels({ x: 0, y: 0 }), { x: 0, y: 0 });
    close(view.pageToPixels({ x: 612, y: 792 }), { x: 800, y: 1035 });
    const [a, b, c, d, e, f] = view.matrix;
    expect([a, b, c, d]).toEqual([800 / 612, 0, 0, 1035 / 792]);
    expect(e === 0 && f === 0).toBe(true);
  });

  it.each([
    [0, { x: 0, y: 0 }, [612, 792]],
    [90, { x: 792, y: 0 }, [792, 612]],
    [180, { x: 612, y: 792 }, [612, 792]],
    [270, { x: 0, y: 612 }, [792, 612]],
  ] as const)(
    'turns the page %i° clockwise: its top-left corner lands at %o',
    (rotation, corner, size) => {
      const view = pageTransform(LETTER, { rotation: rotation as PdfRotation });
      expect([view.width, view.height]).toEqual(size);
      close(view.pageToPixels({ x: 0, y: 0 }), corner);
      // The page's middle stays the image's middle.
      close(view.pageToPixels({ x: 306, y: 396 }), { x: size[0] / 2, y: size[1] / 2 });
    },
  );

  it('keeps a box a box through every turn, and back', () => {
    const box = { x: 100, y: 200, width: 50, height: 20 };
    for (const rotation of [0, 90, 180, 270] as const) {
      const view = pageTransform(LETTER, { rotation, viewport: { kind: 'scale', scale: 2 } });
      const pixels = view.pageToPixels(box);
      const swap = rotation === 90 || rotation === 270;
      expect(pixels.width).toBeCloseTo(swap ? 40 : 100, 9);
      expect(pixels.height).toBeCloseTo(swap ? 100 : 40, 9);
      closeBox(view.pixelsToPage(pixels), box);
    }
  });

  it('maps a quad corner by corner, keeping their order', () => {
    const view = pageTransform(LETTER, { rotation: 90 });
    const quad = {
      p1: { x: 10, y: 20 },
      p2: { x: 30, y: 20 },
      p3: { x: 10, y: 40 },
      p4: { x: 30, y: 40 },
    };
    const pixels = view.pageToPixels(quad);
    close(pixels.p1, view.pageToPixels(quad.p1));
    close(pixels.p4, view.pageToPixels(quad.p4));
  });

  it('measures a target from its own top-left, at its own size', () => {
    const target = { x: 100, y: 250, width: 100, height: 50 };
    const view = pageTransform(LETTER, {
      target: { kind: 'rect', rect: target },
      viewport: { kind: 'width', width: 30 },
    });
    expect([view.width, view.height]).toEqual([30, 15]);
    close(view.pageToPixels({ x: 100, y: 250 }), { x: 0, y: 0 });
    close(view.pageToPixels({ x: 200, y: 300 }), { x: 30, y: 15 });
    close(view.pixelsToPage({ x: 15, y: 7.5 }), { x: 150, y: 275 });
  });

  it('takes a target with its sides given the other way round', () => {
    expect(renderTargetArea({ x: 200, y: 300, width: -100, height: -50 })).toEqual({
      x: 100,
      y: 250,
      width: 100,
      height: 50,
    });
  });

  it('refuses a target without area and a viewport that is not positive', () => {
    for (const rect of [
      { x: 0, y: 0, width: 0, height: 10 },
      { x: Number.NaN, y: 0, width: 10, height: 10 },
    ]) {
      expect(() => pageTransform(LETTER, { target: { kind: 'rect', rect } })).toThrow(
        expect.objectContaining({ code: EngineErrorCode.InvalidArg }),
      );
    }
    expect(() => pageTransform(LETTER, { viewport: { kind: 'width', width: 0 } })).toThrow(
      expect.objectContaining({ code: EngineErrorCode.InvalidArg }),
    );
  });
});
