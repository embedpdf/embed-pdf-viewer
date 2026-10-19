import { describe, expect, it } from 'vitest';

import { frameInPixels, lookFrameOf, rasterInFrame } from '../src/annotation-frame';

/** A page layer at 2 pixels per point and 150% zoom, its top-left 10 pixels in, turned a quarter. */
const page = {
  toPixels: (point: { x: number; y: number }) => ({ x: 10 + point.x * 2, y: 10 + point.y * 2 }),
  rotation: 90,
  zoom: 1.5,
};

describe('an annotation frame in pixels', () => {
  it('places and sizes the frame, and turns it with its own turn only', () => {
    const frame = { box: { x: 100, y: 50, width: 40, height: 20 }, rotation: 30, scale: 1 };
    expect(frameInPixels(frame, page)).toMatchObject({
      left: 210,
      top: 110,
      width: 80,
      height: 40,
      transform: 'rotate(30deg)',
      rotationOnScreen: 120, // its turn and the page's
    });
  });

  it('a look is drawn at the annotation’s 100% size and scaled with the zoom', () => {
    const frame = { box: { x: 100, y: 50, width: 40, height: 20 }, rotation: 0, scale: 1 };
    expect(frameInPixels(frame, page)).toMatchObject({
      scale: 1.5,
      design: { width: 80 / 1.5, height: 40 / 1.5 },
    });
  });

  it('a body that keeps its size on screen is drawn at its own size from 100% up', () => {
    // Zoomed in to 150%, the page draws the note at two thirds: on screen it stays its size.
    const note = { box: { x: 0, y: 0, width: 16, height: 16 }, rotation: 270, scale: 1 / 1.5 };
    const pixels = frameInPixels(note, page);
    expect(pixels.scale).toBeCloseTo(1);
    expect(pixels.design.width).toBeCloseTo(32);
    expect(pixels.rotationOnScreen).toBe(0); // its turn undoes the page's: upright
  });

  it('turns nothing for no turn', () => {
    const upright = { box: { x: 0, y: 0, width: 24, height: 24 }, rotation: 0, scale: 1 };
    expect(frameInPixels(upright, page).transform).toBeUndefined();
  });

  it('places a raster in its frame as percentages, so it fits the frame at any size', () => {
    const frame = { box: { x: 100, y: 50, width: 40, height: 20 }, rotation: 30 };
    const raster = { box: { x: -2, y: -1, width: 44, height: 22 }, rotation: 0 };
    const placed = rasterInFrame(raster, frame);
    const percent = (value: string) => parseFloat(value);
    expect(percent(placed.left)).toBeCloseTo(-5);
    expect(percent(placed.top)).toBeCloseTo(-5);
    expect(percent(placed.width)).toBeCloseTo(110);
    expect(percent(placed.height)).toBeCloseTo(110);
    expect(placed.transform).toBeUndefined();
  });
});

describe('lookFrameOf', () => {
  const pixels = {
    left: 0,
    top: 0,
    width: 40,
    height: 20,
    transform: undefined,
    rotationOnScreen: 90,
    scale: 2,
    design: { width: 20, height: 10 },
  };

  it('draws a scaled look at the annotation’s 100% size, an unscaled one at its size on screen', () => {
    expect(lookFrameOf(pixels, true)).toEqual({ width: 20, height: 10, rotation: 90, scale: 2 });
    expect(lookFrameOf(pixels, false)).toEqual({ width: 40, height: 20, rotation: 90, scale: 2 });
  });
});
