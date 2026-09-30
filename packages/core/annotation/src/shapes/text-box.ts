/**
 * The text box family: free text. Its shape is the engine's own fields: the
 * text box before any turn (`box`), its turn (`rotation`), and for a callout
 * its line (`calloutLine`: the tip, the knee when it bends, and the end on
 * the box) with the ending at the tip (`lineEnding`).
 *
 * The line's end follows the box as the engine's rule has it: when the box
 * moves, turns or resizes, or the tip or knee moves, the end is where the
 * line now meets the box ({@link calloutEnd}); otherwise the stored end
 * stays. Only a plain text box turns with the rotate gesture; a callout's box
 * keeps the turn it was made with.
 *
 * A plain text box's selection frame is its box. A callout's frame is
 * everything it paints (the box, the line and the ending), so it is grabbed,
 * grouped and kept on the page as one object; its handles still act on the
 * box, the tip and the knee.
 */
import type { AnnotationDTO, LineEnding } from '@embedpdf/engine-core/runtime';

import { endingNodes, endingPieces, endingPoints } from '../endings';
import { bodyPieces, type PaintedPiece } from '../painted';
import {
  expandRect,
  insetRect,
  rectCenter,
  rectCornerPoints,
  rotatePoint,
  rotatedAabb,
  unionRect,
} from '../rect';
import type { Handle, HandleSpread, Placement, Point, Rect, RenderNode, Stroke } from '../types';
import {
  boxCorners,
  boxHandles,
  boxHandleSpread,
  boxResize,
  boxRotateAbout,
  boxScaleAbout,
  boxTranslate,
  type TurnedBox,
} from './box';
import type { ShapeFamily } from './family';
import { strokedOutlineOf } from './points';

type FreeTextAnnotation = Extract<AnnotationDTO, { subtype: 'free-text' }>;

/** A callout's line: its tip, its knee when it bends, and where it meets the box. */
export type CalloutLine = NonNullable<FreeTextAnnotation['calloutLine']>;

/** A free text's shape: the engine's box, turn, and a callout's line. */
export interface TextBoxShape extends TurnedBox {
  kind: 'text-box';
  /** A callout's line; `null` for a plain text box. */
  calloutLine: CalloutLine | null;
  /** The ending at a callout's tip. */
  lineEnding: LineEnding | null;
}

/** A plain text box where a create gesture places a box: typed into from empty, turned to read upright. */
function placeTextBox(placement: Placement): TextBoxShape | null {
  if (placement.kind !== 'box') return null;
  return {
    kind: 'text-box',
    box: placement.rect,
    rotation: placement.rot,
    calloutLine: null,
    lineEnding: null,
  };
}

/** A free text's shape, read off its annotation. A line counts only on a callout. */
function readTextBox(read: AnnotationDTO): TextBoxShape {
  const annotation = read as FreeTextAnnotation;
  const line = annotation.intent === 'free-text-callout' ? (annotation.calloutLine ?? null) : null;
  return {
    kind: 'text-box',
    box: annotation.box,
    rotation: annotation.rotation ?? 0,
    calloutLine: line,
    lineEnding: line ? (annotation.lineEnding ?? 'none') : null,
  };
}

/**
 * The engine fields that state `shape`: its `box` and `rotation` (`null` when
 * upright, so a turn is cleared rather than kept), and a callout's line and
 * ending.
 */
function writeTextBox(shape: TextBoxShape): {
  box: Rect;
  rotation: number | null;
  calloutLine?: CalloutLine;
  lineEnding?: LineEnding;
} {
  return {
    box: shape.box,
    rotation: shape.rotation || null,
    ...(shape.calloutLine
      ? { calloutLine: shape.calloutLine, lineEnding: shape.lineEnding ?? 'none' }
      : {}),
  };
}

/**
 * Where a callout's line meets its box: the middle of the side `toward` (the
 * knee, else the tip) lies beyond, chosen by which way it is farther from the
 * box's middle, across or up and down. A turned box decides in its own frame,
 * and the point lands on the turned side, the one the page shows. The
 * engine's rule, in page space.
 */
export function calloutEnd(box: Rect, toward: Point, rotation = 0): Point {
  const middle = rectCenter(box);
  const local = rotation ? rotatePoint(toward, middle, -rotation) : toward;
  const dx = local.x - middle.x;
  const dy = local.y - middle.y;
  const end =
    Math.abs(dx) >= Math.abs(dy)
      ? { x: dx >= 0 ? box.x + box.width : box.x, y: middle.y }
      : { x: middle.x, y: dy >= 0 ? box.y + box.height : box.y };
  return rotation ? rotatePoint(end, middle, rotation) : end;
}

/** The line from `tip`, through `knee` when it bends, to where it meets the box. */
const lineTo = (box: TurnedBox, tip: Point, knee?: Point): CalloutLine =>
  knee
    ? [tip, knee, calloutEnd(box.box, knee, box.rotation)]
    : [tip, calloutEnd(box.box, tip, box.rotation)];

/** A new callout: its box and turn, a line from `tip` (through `knee`), and the ending at the tip. */
export function calloutShape(
  box: Rect,
  rotation: number,
  tip: Point,
  knee: Point | undefined,
  lineEnding: LineEnding,
): TextBoxShape {
  const turned = { box, rotation };
  return { kind: 'text-box', ...turned, calloutLine: lineTo(turned, tip, knee), lineEnding };
}

/** The shape with its line's end where the line now meets the box. */
function endFollows(shape: TextBoxShape): TextBoxShape {
  const line = shape.calloutLine;
  if (!line) return shape;
  return { ...shape, calloutLine: lineTo(shape, line[0], line.length === 3 ? line[1] : undefined) };
}

/** The shape moved by `delta`: the box and the whole line. */
function textBoxTranslate(shape: TextBoxShape, delta: Point): TextBoxShape {
  const moved = boxTranslate(shape, delta);
  const line = shape.calloutLine;
  if (!line) return moved;
  const move = (point: Point): Point => ({ x: point.x + delta.x, y: point.y + delta.y });
  return { ...moved, calloutLine: line.map(move) as unknown as CalloutLine };
}

/** A plain text box turned `degrees` about `pivot`; a callout stays as it is. */
function textBoxRotateAbout(shape: TextBoxShape, pivot: Point, degrees: number) {
  return shape.calloutLine ? shape : boxRotateAbout(shape, pivot, degrees);
}

/** A plain text box scaled about `anchor`; a callout stays as it is. */
function textBoxScaleAbout(shape: TextBoxShape, anchor: Point, sx: number, sy: number) {
  return shape.calloutLine ? shape : boxScaleAbout(shape, anchor, sx, sy);
}

/** The shape upright: its turn cleared, and a callout's end back on the upright box. */
function textBoxUpright(shape: TextBoxShape): TextBoxShape {
  return endFollows({ ...shape, rotation: 0 });
}

/** The box's eight resize handles, standing out by `spread`, and a callout's tip and knee. */
function textBoxHandles(shape: TextBoxShape, spread: HandleSpread): Handle[] {
  const handles = boxHandles(shape, spread);
  const line = shape.calloutLine;
  if (line) {
    handles.push({ id: 'callout-tip', at: line[0], cursor: 'crosshair' });
    if (line.length === 3) handles.push({ id: 'callout-knee', at: line[1], cursor: 'crosshair' });
  }
  return handles;
}

/** The shape with `handle` dragged to `to`: the tip, the knee, or a side of the box. */
function textBoxDrag(
  shape: TextBoxShape,
  handle: string,
  to: Point,
  spread: HandleSpread,
): TextBoxShape {
  const line = shape.calloutLine;
  if (line && handle === 'callout-tip') {
    return endFollows({
      ...shape,
      calloutLine: line.length === 3 ? [to, line[1], line[2]] : [to, line[1]],
    });
  }
  if (line && handle === 'callout-knee') {
    return line.length === 3
      ? endFollows({ ...shape, calloutLine: [line[0], to, line[2]] })
      : shape;
  }
  return endFollows(boxResize(shape, handle, to, spread));
}

/** The angle the arrow at the tip points: out of the line, into the tip. */
const tipAngle = (line: CalloutLine): number =>
  Math.atan2(line[0].y - line[1].y, line[0].x - line[1].x);

/**
 * What the shape draws, the engine's `rect`: a plain box; a callout's box as
 * the page shows it, its line and the arrow at its tip, grown by half the
 * stroke.
 */
function textBoxDrawnBounds(shape: TextBoxShape, { strokeWidth }: Stroke): Rect {
  const line = shape.calloutLine;
  if (!line) return shape.box;
  const points = [...boxCorners(shape), ...line];
  if (shape.lineEnding) {
    points.push(...endingPoints(line[0], tipAngle(line), shape.lineEnding, strokeWidth));
  }
  return expandRect(unionRect(points), strokeWidth / 2);
}

/**
 * The upright page box around all it paints. The box, turned about its
 * middle: its border lies inside it. A callout's line, stroked from its tip
 * (a butt end) and run half the stroke into the box's border so it meets the
 * box without a gap, and the ending at its tip.
 */
function textBoxRect(shape: TextBoxShape, { strokeWidth }: Stroke): Rect {
  const box = rotatedAabb(shape.box, shape.rotation);
  const line = shape.calloutLine;
  if (!line) return box;
  const end = line[line.length - 1]!;
  const before = line[line.length - 2]!;
  const length = Math.hypot(end.x - before.x, end.y - before.y) || 1;
  const reach = strokeWidth / 2 / length;
  const drawn = [
    ...line.slice(0, -1),
    { x: end.x + (end.x - before.x) * reach, y: end.y + (end.y - before.y) * reach },
  ];
  const nodes: RenderNode[] = [
    { kind: 'poly', points: drawn, closed: false },
    ...endingNodes(line[0], tipAngle(line), shape.lineEnding ?? undefined, strokeWidth),
  ];
  return unionRect([...rectCornerPoints(box), ...strokedOutlineOf(nodes, strokeWidth)]);
}

/** What a selection wraps: a plain box, or everything a callout paints. */
function textBoxSelectionBounds(shape: TextBoxShape, stroke: Stroke): Rect {
  return shape.calloutLine ? textBoxRect(shape, stroke) : shape.box;
}

/**
 * What the shape paints: its box, where its text is, grabbed anywhere in it
 * and near its edge; and a callout's line, the stroke wide, and the ending at
 * its tip.
 */
function textBoxPainted(shape: TextBoxShape, { strokeWidth }: Stroke): PaintedPiece[] {
  const pieces = bodyPieces(boxCorners(shape));
  const line = shape.calloutLine;
  if (!line) return pieces;
  pieces.push({ kind: 'stroke', points: line, closed: false, halfWidth: strokeWidth / 2 });
  const ending = endingNodes(line[0], tipAngle(line), shape.lineEnding ?? undefined, strokeWidth);
  return [...pieces, ...endingPieces(ending, strokeWidth)];
}

/**
 * What the shape draws, as the AP generator bakes it: a callout's line and
 * the arrow at its tip, then the box's border inset half the stroke, as the
 * page shows it. The line's end reaches under the border by half the stroke
 * (the generator's `adjusted_conn`), so the two meet without a gap. The text
 * itself is the framework's editable element, not part of the scene.
 */
function textBoxScene(shape: TextBoxShape, { strokeWidth }: Stroke): RenderNode[] {
  const nodes: RenderNode[] = [];
  const line = shape.calloutLine;
  if (line) {
    const points = [...line];
    const last = points[points.length - 1]!;
    const previous = points[points.length - 2]!;
    const length = Math.hypot(last.x - previous.x, last.y - previous.y);
    if (strokeWidth > 0 && length > 0) {
      points[points.length - 1] = {
        x: last.x + ((last.x - previous.x) / length) * (strokeWidth / 2),
        y: last.y + ((last.y - previous.y) / length) * (strokeWidth / 2),
      };
    }
    nodes.push({ kind: 'poly', points, closed: false });
    if (shape.lineEnding)
      nodes.push(...endingNodes(line[0], tipAngle(line), shape.lineEnding, strokeWidth));
  }
  const border = insetRect(shape.box, strokeWidth / 2);
  const middle = rectCenter(shape.box);
  nodes.push(
    shape.rotation
      ? {
          kind: 'poly',
          points: rectCornerPoints(border).map((corner) =>
            rotatePoint(corner, middle, shape.rotation),
          ),
          closed: true,
        }
      : { kind: 'rect', rect: border },
  );
  return nodes;
}

/**
 * The text box family: a free text's box and turn, and a callout's line.
 * Only a plain box turns; a callout's box keeps the turn it was made with,
 * and a selection outlines everything it paints, upright.
 */
export const textBoxFamily: ShapeFamily<TextBoxShape> = {
  read: readTextBox,
  write: writeTextBox,
  placed: placeTextBox,
  bounds: (shape) => shape.box,
  drawnBounds: textBoxDrawnBounds,
  rect: textBoxRect,
  selectionBounds: textBoxSelectionBounds,
  oriented: (shape) => !shape.calloutLine,
  turnedCorners: (shape) => (shape.calloutLine ? null : boxCorners(shape)),
  pivot: (shape) => rectCenter(shape.box),
  translate: textBoxTranslate,
  rotateAbout: textBoxRotateAbout,
  scaleAbout: textBoxScaleAbout,
  upright: textBoxUpright,
  handleSpread: boxHandleSpread,
  handles: textBoxHandles,
  drag: textBoxDrag,
  // A text box is hit anywhere in its box, filled or not.
  painted: (shape, stroke) => textBoxPainted(shape, stroke),
  scene: textBoxScene,
};

/**
 * The text plate inset of a free-text box: twice the border width. The plate
 * — where text lays out, clips and scrolls — is the box deflated by this on
 * every side: the ink band and an equal breathing band, so the text never
 * touches the stroke. Acrobat's rule, measured 1–12 pt on plain boxes and
 * 1–7 pt on callouts; the engine's `FreeTextPlate` is the same formula, so
 * the live editor sits exactly where the baked text lands. Acrobat's thinnest
 * border is 1 pt; a width of 0 is ours alone and gives no inset (the plate is
 * the box).
 */
export function textPlateInset(strokeWidth: number): number {
  return 2 * Math.max(0, strokeWidth);
}
