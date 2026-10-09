/**
 * Where a render item draws. Its frame is the box a painter draws into,
 * placed and turned on the page like the annotation; everything the item
 * draws sits upright inside it: its scene, a custom look, or the engine's
 * raster at its own box and turn. Every item carries both, so a framework
 * layer paints from data and decides no placement of its own.
 */
import { normalizeDeg, rectCenter, rotatePoint } from './rect';
import type { Rect, RenderItem, Shape } from './types';

/** A box and its turn, degrees clockwise about the box's middle. */
type TurnedBox = { box: Rect; rotation: number };

/**
 * The frame's turn: the annotation's own turn for every shape that is a turned
 * box (a box, a caret, a text box without a callout). A callout and the vertex
 * kinds carry their turn in their points, so their frame stays upright.
 */
function frameRotationOf(geometry: Shape, rot: number | undefined): number {
  const turnedBox =
    geometry.kind === 'box' ||
    geometry.kind === 'caret' ||
    (geometry.kind === 'text-box' && !geometry.calloutLine);
  return turnedBox ? normalizeDeg(rot ?? 0) : 0;
}

/**
 * Where a raster sits inside a frame: its box relative to the frame's
 * top-left before the frame's turn, and its own turn about its middle. Drawn
 * inside the frame, it lands exactly where the raster lands on its own
 * (`raster` turned by `rotation`).
 */
export function rasterInFrame(frame: TurnedBox, raster: Rect, rotation: number): TurnedBox {
  const middle = rotatePoint(rectCenter(raster), rectCenter(frame.box), -frame.rotation);
  return {
    box: {
      x: middle.x - raster.width / 2 - frame.box.x,
      y: middle.y - raster.height / 2 - frame.box.y,
      width: raster.width,
      height: raster.height,
    },
    rotation: normalizeDeg(rotation - frame.rotation),
  };
}

/**
 * The item with where it draws: its frame, and the engine's raster inside it.
 * `scale` is how large the page draws the item relative to its own size: below
 * 1 only for a body that keeps its size on screen (`anchoredScale`).
 */
export function placed(item: Omit<RenderItem, 'frame' | 'raster'>, scale = 1): RenderItem {
  const frame = { box: item.box, rotation: frameRotationOf(item.geometry, item.rot), scale };
  return {
    ...item,
    frame,
    raster: item.apBox ? rasterInFrame(frame, item.apBox, item.apRot ?? 0) : null,
  };
}
