import { encodePageKey, toPageRef } from '@embedpdf/core';
import { describe, expect, it } from 'vitest';

import {
  pageFrameOf,
  pageFrameWidth,
  pageKeyOfFrame,
  sharpFrameOf,
  shownSizeOf,
} from '../../src/services/frames';
import { pictureOf } from '../helpers/fakes';

describe('page frames', () => {
  it('are about twice as wide as the page shows, rounded up to a step of 256', () => {
    // 600 pt at 100% on a 1× screen: 800 device pixels wide.
    const page = pictureOf(1, { dpr: 1 });
    expect(page.transform.deviceWidth).toBe(800);
    expect(pageFrameWidth(page.transform)).toBe(1792);
  });

  it('stay within what the protected decoders take for the page’s shape', () => {
    // 4096 a side and 9.4 million pixels: a 3 × 4 page is held by its pixel count, here at 100%
    // on a 2× screen already.
    const largest = 2 * Math.floor(Math.sqrt(9_400_000 * (600 / 800)) / 2);
    expect(pageFrameWidth(pictureOf(1).transform)).toBe(largest);
    expect(pageFrameWidth(pictureOf(1, { zoom: 3 }).transform)).toBe(largest);
  });

  it('are keyed by page, content version and width, and carry the frames route’s query', () => {
    const frame = pageFrameOf(pictureOf(2, { dpr: 1 }), 3);
    const pageKey = encodePageKey(toPageRef(2));
    expect(frame).toMatchObject({ pageKey, version: 3, width: 1792 });
    expect(frame.key).toBe(`${pageKey}#3w1792`);
    expect(pageKeyOfFrame(frame.key)).toBe(pageKey);
    expect(frame.query).toEqual({ 'viewport.kind': 'width', 'viewport.width': '1792' });
  });
});

describe('sharp frames', () => {
  const visible = { x: 100, y: 200, width: 150, height: 100 };

  it('are none while the page frame is sharp enough at the page’s size', () => {
    const frame = pageFrameOf(pictureOf(1, { dpr: 1 }), 0);
    // Twice the size it first showed at: still the page frame's own resolution.
    expect(sharpFrameOf(frame, pictureOf(1, { zoom: 2, dpr: 1 }).transform, visible)).toBeNull();
  });

  it('are of the part on screen, at the screen’s resolution, placed in the content box', () => {
    const frame = pageFrameOf(pictureOf(1), 0);
    const zoomed = pictureOf(1, { zoom: 4 }).transform;
    const sharp = sharpFrameOf(frame, zoomed, visible)!;
    // 4 × 96/72 view pixels a point: the part is 800 × 533⅓ in the box, twice that in device pixels.
    expect(sharp.rectInBox.x).toBeCloseTo(533.33, 1);
    expect(sharp.rectInBox.y).toBeCloseTo(1066.67, 1);
    expect(sharp.rectInBox.width).toBeCloseTo(800, 1);
    expect(sharp.query).toMatchObject({
      'target.kind': 'rect',
      'target.rect.x': '100',
      'target.rect.width': '150',
      'viewport.width': '1600',
    });
    expect(sharp.key).toBe(`${frame.pageKey}#0r100.0,200.0,150.0,100.0w1600`);
  });

  it('sit in the unturned content box on a turned page', () => {
    const frame = pageFrameOf(pictureOf(1), 0);
    const upright = sharpFrameOf(frame, pictureOf(1, { zoom: 4 }).transform, visible)!;
    const turned = sharpFrameOf(frame, pictureOf(1, { zoom: 4, rotation: 90 }).transform, visible)!;
    expect(turned.rectInBox).toEqual(upright.rectInBox);
    expect(turned.key).toBe(upright.key);
  });

  it('are none when nothing of the page is on screen', () => {
    const frame = pageFrameOf(pictureOf(1), 0);
    const zoomed = pictureOf(1, { zoom: 4 }).transform;
    expect(sharpFrameOf(frame, zoomed, { x: 0, y: 0, width: 0, height: 10 })).toBeNull();
  });
});

describe('the size a page shows at', () => {
  it('is its device pixels, so a page frame draws again when it changes', () => {
    expect(shownSizeOf(pictureOf(1).transform)).toBe('1600x2133');
    expect(shownSizeOf(pictureOf(1, { rotation: 90 }).transform)).toBe('1600x2133');
    expect(shownSizeOf(pictureOf(1, { zoom: 2 }).transform)).toBe('3200x4267');
  });
});
