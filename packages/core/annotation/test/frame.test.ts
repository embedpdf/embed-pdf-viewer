import { describe, expect, it } from 'vitest';

import { placed, rasterInFrame } from '../src/frame';
import type { RenderItem } from '../src';

/** An item with what a frame is made from: its geometry, box, turn and raster box. */
const itemOf = (
  geometry: RenderItem['geometry'],
  box: RenderItem['box'],
  rot: number,
  raster?: { box: RenderItem['box']; rot?: number },
): RenderItem =>
  placed({
    id: 'a',
    ref: null,
    subtype: 'square',
    geometry,
    box,
    rot,
    ...(raster ? { apBox: raster.box, ...(raster.rot ? { apRot: raster.rot } : {}) } : {}),
    style: {} as RenderItem['style'],
    source: 'vector',
    selected: false,
  });

const BOX = { x: 100, y: 100, width: 200, height: 50 };
const square = (rotation: number) => ({ kind: 'box' as const, box: BOX, rotation, ellipse: false });

/** Turn `point` about `pivot` by `deg` clockwise (y down), as CSS `rotate()` does. */
const turned = (point: { x: number; y: number }, pivot: { x: number; y: number }, deg: number) => {
  const rad = (deg * Math.PI) / 180;
  const dx = point.x - pivot.x;
  const dy = point.y - pivot.y;
  return {
    x: pivot.x + dx * Math.cos(rad) - dy * Math.sin(rad),
    y: pivot.y + dx * Math.sin(rad) + dy * Math.cos(rad),
  };
};

describe('where a render item draws', () => {
  it('a box turns its frame with its own turn', () => {
    expect(itemOf(square(390), BOX, 390).frame).toEqual({ box: BOX, rotation: 30, scale: 1 });
  });

  it('a vertex kind and a callout keep their frame upright: their turn is in their points', () => {
    const line = {
      kind: 'line' as const,
      linePoints: { start: { x: 100, y: 100 }, end: { x: 300, y: 150 } },
      rotation: 30,
    };
    expect(itemOf(line, BOX, 30).frame.rotation).toBe(0);
    const callout = {
      kind: 'text-box' as const,
      box: BOX,
      rotation: 0,
      calloutLine: [{ x: 0, y: 0 }],
    } as unknown as RenderItem['geometry'];
    expect(itemOf(callout, BOX, 0).frame.rotation).toBe(0);
  });

  it('a text box turns its frame, as a box does', () => {
    const textBox = {
      kind: 'text-box',
      box: BOX,
      rotation: 30,
    } as unknown as RenderItem['geometry'];
    expect(itemOf(textBox, BOX, 30).frame.rotation).toBe(30);
  });

  it('has no raster without a raster box', () => {
    expect(itemOf(square(0), BOX, 0).raster).toBeNull();
  });

  it('holds a stamp’s raster in place: the same box, no turn of its own', () => {
    // The engine's raster, its stroke a little wider than the box on every side.
    const raster = { x: 98, y: 98, width: 204, height: 54 };
    expect(itemOf(square(90), BOX, 90, { box: raster, rot: 90 }).raster).toEqual({
      box: { x: -2, y: -2, width: 204, height: 54 },
      rotation: 0,
    });
  });

  it('puts a raster off the frame’s middle exactly where it lands on its own', () => {
    const raster = { x: 140, y: 90, width: 60, height: 40 };
    const { box: inFrame, rotation } = rasterInFrame({ box: BOX, rotation: 30 }, raster, 75);
    // Inside the frame: its middle, then the frame's turn about the frame's middle.
    const frameMiddle = { x: BOX.x + BOX.width / 2, y: BOX.y + BOX.height / 2 };
    const middle = turned(
      { x: BOX.x + inFrame.x + inFrame.width / 2, y: BOX.y + inFrame.y + inFrame.height / 2 },
      frameMiddle,
      30,
    );
    expect(middle.x).toBeCloseTo(raster.x + raster.width / 2);
    expect(middle.y).toBeCloseTo(raster.y + raster.height / 2);
    expect(rotation + 30).toBe(75); // its own turn plus the frame's: the raster's
  });
});
