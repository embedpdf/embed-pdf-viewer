/**
 * Clockwise direction
 * @public
 */
export enum Rotation {
  Degree0 = 0,
  Degree90 = 1,
  Degree180 = 2,
  Degree270 = 3,
}

/** Clamp a Position to device-pixel integers (floor) */
export function toIntPos(p: Position): Position {
  return { x: Math.floor(p.x), y: Math.floor(p.y) };
}

/** Clamp a Size so it never truncates right / bottom (ceil) */
export function toIntSize(s: Size): Size {
  return { width: Math.ceil(s.width), height: Math.ceil(s.height) };
}

/** Apply both rules to a Rect */
export function toIntRect(r: Rect): Rect {
  return {
    origin: toIntPos(r.origin),
    size: toIntSize(r.size),
  };
}

/**
 * Calculate degree that match the rotation type
 * @param rotation - type of rotation
 * @returns rotated degree
 *
 * @public
 */
export function calculateDegree(rotation: Rotation) {
  switch (rotation) {
    case Rotation.Degree0:
      return 0;
    case Rotation.Degree90:
      return 90;
    case Rotation.Degree180:
      return 180;
    case Rotation.Degree270:
      return 270;
  }
}

/**
 * Calculate angle that match the rotation type
 * @param rotation - type of rotation
 * @returns rotated angle
 *
 * @public
 */
export function calculateAngle(rotation: Rotation) {
  return (calculateDegree(rotation) * Math.PI) / 180;
}

/**
 * Represent the size of object
 *
 * @public
 */
export interface Size {
  /**
   * width of the object
   */
  width: number;

  /**
   * height of the object
   */
  height: number;
}

/**
 * Represents a rectangle defined by its left, top, right, and bottom edges
 *
 * @public
 */
export interface Box {
  /**
   * The x-coordinate of the left edge
   */
  left: number;

  /**
   * The y-coordinate of the top edge
   */
  top: number;

  /**
   * The x-coordinate of the right edge
   */
  right: number;

  /**
   * The y-coordinate of the bottom edge
   */
  bottom: number;
}

/**
 * Swap the width and height of the size object
 * @param size - the original size
 * @returns swapped size
 *
 * @public
 */
export function swap(size: Size): Size {
  const { width, height } = size;

  return {
    width: height,
    height: width,
  };
}

/**
 * Transform size with specified rotation angle and scale factor
 * @param size - orignal size of rect
 * @param rotation - rotation angle
 * @param scaleFactor - - scale factor
 * @returns size that has been transformed
 *
 * @public
 */
export function transformSize(size: Size, rotation: Rotation, scaleFactor: number): Size {
  size = rotation % 2 === 0 ? size : swap(size);

  return {
    width: size.width * scaleFactor,
    height: size.height * scaleFactor,
  };
}

/**
 * position of point
 *
 * @public
 */
export interface Position {
  /**
   * x coordinate
   */
  x: number;

  /**
   * y coordinate
   */
  y: number;
}

/**
 * Quadrilateral
 *
 * @public
 */
export interface Quad {
  p1: Position;
  p2: Position;
  p3: Position;
  p4: Position;
}

/**
 * Convert quadrilateral to rectangle
 * @param q - quadrilateral
 * @returns rectangle
 *
 * @public
 */
export function quadToRect(q: Quad): Rect {
  const xs = [q.p1.x, q.p2.x, q.p3.x, q.p4.x];
  const ys = [q.p1.y, q.p2.y, q.p3.y, q.p4.y];

  return {
    origin: { x: Math.min(...xs), y: Math.min(...ys) },
    size: {
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    },
  };
}

/**
 * Convert rectangle to quadrilateral
 * @param r - rectangle
 * @returns quadrilateral
 *
 * @public
 */
export function rectToQuad(r: Rect): Quad {
  return {
    p1: { x: r.origin.x, y: r.origin.y },
    p2: { x: r.origin.x + r.size.width, y: r.origin.y },
    p3: { x: r.origin.x + r.size.width, y: r.origin.y + r.size.height },
    p4: { x: r.origin.x, y: r.origin.y + r.size.height },
  };
}

/**
 * Rotate the container and calculate the new position for a point
 * in specified position
 * @param containerSize - size of the container
 * @param position - position of the point
 * @param rotation - rotated angle
 * @returns new position of the point
 *
 * @public
 */
export function rotatePosition(
  containerSize: Size,
  position: Position,
  rotation: Rotation,
): Position {
  let x = position.x;
  let y = position.y;

  switch (rotation) {
    case Rotation.Degree0:
      x = position.x;
      y = position.y;
      break;
    case Rotation.Degree90:
      x = containerSize.height - position.y;
      y = position.x;
      break;
    case Rotation.Degree180:
      x = containerSize.width - position.x;
      y = containerSize.height - position.y;
      break;
    case Rotation.Degree270:
      x = position.y;
      y = containerSize.width - position.x;
      break;
  }

  return {
    x,
    y,
  };
}

/**
 * Calculate the position of point by scaling the container
 * @param position - position of the point
 * @param scaleFactor - factor of scaling
 * @returns new position of point
 *
 * @public
 */
export function scalePosition(position: Position, scaleFactor: number): Position {
  return {
    x: position.x * scaleFactor,
    y: position.y * scaleFactor,
  };
}

/**
 * Calculate the position of the point by applying the specified transformation
 * @param containerSize - size of container
 * @param position - position of the point
 * @param rotation - rotated angle
 * @param scaleFactor - factor of scaling
 * @returns new position of point
 *
 * @public
 */
export function transformPosition(
  containerSize: Size,
  position: Position,
  rotation: Rotation,
  scaleFactor: number,
): Position {
  return scalePosition(rotatePosition(containerSize, position, rotation), scaleFactor);
}

/**
 * Restore the position in a transformed cotainer
 * @param containerSize - size of the container
 * @param position - position of the point
 * @param rotation - rotated angle
 * @param scaleFactor - factor of scaling
 * @returns the original position of the point
 *
 * @public
 */
export function restorePosition(
  containerSize: Size,
  position: Position,
  rotation: Rotation,
  scaleFactor: number,
): Position {
  return scalePosition(
    rotatePosition(containerSize, position, (4 - rotation) % 4),
    1 / scaleFactor,
  );
}

/**
 * representation of rectangle
 *
 * @public
 */
export interface Rect {
  /**
   * origin of the rectangle
   */
  origin: Position;

  /**
   * size of the rectangle
   */
  size: Size;
}

/**
 * Check if two rectangles are equal
 * @param a - first rectangle
 * @param b - second rectangle
 * @returns true if the rectangles are equal, false otherwise
 *
 * @public
 */
export function rectEquals(a: Rect, b: Rect): boolean {
  return (
    a.origin.x === b.origin.x &&
    a.origin.y === b.origin.y &&
    a.size.width === b.size.width &&
    a.size.height === b.size.height
  );
}

/**
 * Calculate the rect from the given points
 * @param pts - points
 * @returns rect
 *
 * @public
 */
export function rectFromPoints(positions: Position[]): Rect {
  if (positions.length === 0) {
    return { origin: { x: 0, y: 0 }, size: { width: 0, height: 0 } };
  }
  const xs = positions.map((p) => p.x);
  const ys = positions.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    origin: { x: minX, y: minY },
    size: {
      width: Math.max(...xs) - minX,
      height: Math.max(...ys) - minY,
    },
  };
}

/**
 * Transform the point by the given angle and translation
 * @param pos - point
 * @param angleRad - angle in radians
 * @param translate - translation
 * @returns transformed point
 *
 * @public
 */
export function rotateAndTranslatePoint(
  pos: Position,
  angleRad: number,
  translate: Position,
): Position {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const newX = pos.x * cos - pos.y * sin;
  const newY = pos.x * sin + pos.y * cos;
  return {
    x: newX + translate.x,
    y: newY + translate.y,
  };
}

/**
 * Expand the rect by the given padding
 * @param rect - rectangle
 * @param padding - padding
 * @returns expanded rect
 *
 * @public
 */
export function expandRect(rect: Rect, padding: number): Rect {
  return {
    origin: { x: rect.origin.x - padding, y: rect.origin.y - padding },
    size: { width: rect.size.width + padding * 2, height: rect.size.height + padding * 2 },
  };
}

/**
 * Calculate the rect after rotated the container
 * @param containerSize - size of container
 * @param rect - target rect
 * @param rotation - rotation angle
 * @returns rotated rect
 *
 * @public
 */
export function rotateRect(containerSize: Size, rect: Rect, rotation: Rotation): Rect {
  let x = rect.origin.x;
  let y = rect.origin.y;
  let size = rect.size;

  switch (rotation) {
    case Rotation.Degree0:
      break;
    case Rotation.Degree90:
      x = containerSize.height - rect.origin.y - rect.size.height;
      y = rect.origin.x;
      size = swap(rect.size);
      break;
    case Rotation.Degree180:
      x = containerSize.width - rect.origin.x - rect.size.width;
      y = containerSize.height - rect.origin.y - rect.size.height;
      break;
    case Rotation.Degree270:
      x = rect.origin.y;
      y = containerSize.width - rect.origin.x - rect.size.width;
      size = swap(rect.size);
      break;
  }

  return {
    origin: {
      x,
      y,
    },
    size: {
      width: size.width,
      height: size.height,
    },
  };
}

/**
 * Scale the rectangle
 * @param rect - rectangle
 * @param scaleFactor - factor of scaling
 * @returns new rectangle
 *
 * @public
 */
export function scaleRect(rect: Rect, scaleFactor: number): Rect {
  return {
    origin: {
      x: rect.origin.x * scaleFactor,
      y: rect.origin.y * scaleFactor,
    },
    size: {
      width: rect.size.width * scaleFactor,
      height: rect.size.height * scaleFactor,
    },
  };
}

/**
 * Calculate new rectangle after transforming the container
 * @param containerSize - size of the container
 * @param rect - the target rectangle
 * @param rotation - rotated angle
 * @param scaleFactor - factor of scaling
 * @returns new rectangle after transformation
 *
 * @public
 */
export function transformRect(
  containerSize: Size,
  rect: Rect,
  rotation: Rotation,
  scaleFactor: number,
): Rect {
  return scaleRect(rotateRect(containerSize, rect, rotation), scaleFactor);
}

/**
 * Calculate new rectangle before transforming the container
 * @param containerSize - size of the container
 * @param rect - the target rectangle
 * @param rotation - rotated angle
 * @param scaleFactor - factor of scaling
 * @returns original rectangle before transformation
 *
 * @public
 */
export function restoreRect(
  containerSize: Size,
  rect: Rect,
  rotation: Rotation,
  scaleFactor: number,
): Rect {
  return scaleRect(rotateRect(containerSize, rect, (4 - rotation) % 4), 1 / scaleFactor);
}

/**
 * Calculate the original offset in a transformed container
 * @param offset - position of the point
 * @param rotation - rotated angle
 * @param scaleFactor - factor of scaling
 * @returns original position of the point
 *
 * @public
 */
export function restoreOffset(offset: Position, rotation: Rotation, scaleFactor: number): Position {
  let offsetX = offset.x;
  let offsetY = offset.y;
  switch (rotation) {
    case Rotation.Degree0:
      offsetX = offset.x / scaleFactor;
      offsetY = offset.y / scaleFactor;
      break;
    case Rotation.Degree90:
      offsetX = offset.y / scaleFactor;
      offsetY = -offset.x / scaleFactor;
      break;
    case Rotation.Degree180:
      offsetX = -offset.x / scaleFactor;
      offsetY = -offset.y / scaleFactor;
      break;
    case Rotation.Degree270:
      offsetX = -offset.y / scaleFactor;
      offsetY = offset.x / scaleFactor;
      break;
  }

  return {
    x: offsetX,
    y: offsetY,
  };
}

/** Empty rect constant (origin at 0,0 with zero size) */
const EMPTY_RECT: Rect = { origin: { x: 0, y: 0 }, size: { width: 0, height: 0 } };

/**
 * Return the smallest rectangle that encloses *all* `rects`.
 * If the array is empty, returns `null`.
 *
 * @param rects - array of rectangles
 * @returns smallest rectangle that encloses all the rectangles, or null if empty
 *
 * @public
 */
export function boundingRect(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;

  let minX = rects[0].origin.x,
    minY = rects[0].origin.y,
    maxX = rects[0].origin.x + rects[0].size.width,
    maxY = rects[0].origin.y + rects[0].size.height;

  for (const r of rects) {
    minX = Math.min(minX, r.origin.x);
    minY = Math.min(minY, r.origin.y);
    maxX = Math.max(maxX, r.origin.x + r.size.width);
    maxY = Math.max(maxY, r.origin.y + r.size.height);
  }

  return {
    origin: {
      x: minX,
      y: minY,
    },
    size: {
      width: maxX - minX,
      height: maxY - minY,
    },
  };
}

/**
 * Return the smallest rectangle that encloses *all* `rects`.
 * If the array is empty, returns an empty rect (origin at 0,0 with zero size).
 *
 * @param rects - array of rectangles
 * @returns smallest rectangle that encloses all the rectangles, or empty rect if empty
 *
 * @public
 */
export function boundingRectOrEmpty(rects: Rect[]): Rect {
  return boundingRect(rects) ?? EMPTY_RECT;
}

export interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

/**
 * Normalize an angle in degrees to the range [0, 360).
 *
 * @param degrees - angle in degrees
 * @returns normalized angle in [0, 360)
 *
 * @public
 */
export function normalizeAngle(degrees: number): number {
  const normalized = degrees % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

/**
 * Calculate the center of a rectangle.
 *
 * @param rect - rectangle
 * @returns center position
 *
 * @public
 */
export function getRectCenter(rect: Rect): Position {
  return {
    x: rect.origin.x + rect.size.width / 2,
    y: rect.origin.y + rect.size.height / 2,
  };
}

/**
 * Rotate a point around a center by the given angle in degrees.
 *
 * @param point - the point to rotate
 * @param center - the center of rotation
 * @param angleDegrees - rotation angle in degrees
 * @returns rotated point
 *
 * @public
 */
export function rotatePointAround(
  point: Position,
  center: Position,
  angleDegrees: number,
): Position {
  const angleRad = (angleDegrees * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

/**
 * Rotate an array of points around a center by the given angle in degrees.
 *
 * @param points - the points to rotate
 * @param center - the center of rotation
 * @param angleDegrees - rotation angle in degrees
 * @returns rotated points
 *
 * @public
 */
export function rotateVertices(
  points: Position[],
  center: Position,
  angleDegrees: number,
): Position[] {
  return points.map((v) => rotatePointAround(v, center, angleDegrees));
}

/**
 * Calculate the axis-aligned bounding box for a rectangle rotated around an arbitrary point.
 *
 * @param rect - the unrotated rectangle
 * @param angleDegrees - rotation angle in degrees
 * @param center - the center of rotation
 * @returns the AABB of the rotated rectangle
 *
 * @public
 */
export function calculateRotatedRectAABBAroundPoint(
  rect: Rect,
  angleDegrees: number,
  center: Position,
): Rect {
  const corners: Position[] = [
    { x: rect.origin.x, y: rect.origin.y },
    { x: rect.origin.x + rect.size.width, y: rect.origin.y },
    { x: rect.origin.x + rect.size.width, y: rect.origin.y + rect.size.height },
    { x: rect.origin.x, y: rect.origin.y + rect.size.height },
  ];
  const rotated = rotateVertices(corners, center, angleDegrees);
  return rectFromPoints(rotated);
}

/**
 * Calculate the axis-aligned bounding box for a rectangle rotated around its own center.
 *
 * @param unrotatedRect - the unrotated rectangle
 * @param angleDegrees - rotation angle in degrees
 * @returns the AABB of the rotated rectangle
 *
 * @public
 */
export function calculateRotatedRectAABB(unrotatedRect: Rect, angleDegrees: number): Rect {
  return calculateRotatedRectAABBAroundPoint(
    unrotatedRect,
    angleDegrees,
    getRectCenter(unrotatedRect),
  );
}

/**
 * Infer the world-space rotation center from unrotated rect + rotated AABB + angle.
 * Falls back to the unrotated rect center when angle is effectively 0.
 *
 * @param unrotatedRect - the unrotated rectangle
 * @param rotatedAabb - the axis-aligned bounding box of the rotated rectangle
 * @param angleDegrees - rotation angle in degrees
 * @returns the inferred rotation center
 *
 * @public
 */
export function inferRotationCenterFromRects(
  unrotatedRect: Rect,
  rotatedAabb: Rect,
  angleDegrees: number,
): Position {
  const angleRad = (angleDegrees * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);

  // (I - R) becomes singular at 0deg (and full turns), where pivot is irrelevant.
  const m00 = 1 - cos;
  const m01 = sin;
  const m10 = -sin;
  const m11 = 1 - cos;
  const det = m00 * m11 - m01 * m10;

  const unrotatedCenter = getRectCenter(unrotatedRect);
  if (Math.abs(det) < 1e-10) return unrotatedCenter;

  const rotatedCenter = getRectCenter(rotatedAabb);
  const rhsX = rotatedCenter.x - (cos * unrotatedCenter.x - sin * unrotatedCenter.y);
  const rhsY = rotatedCenter.y - (sin * unrotatedCenter.x + cos * unrotatedCenter.y);

  return {
    x: (m11 * rhsX - m01 * rhsY) / det,
    y: (-m10 * rhsX + m00 * rhsY) / det,
  };
}

export function buildUserToDeviceMatrix(
  rect: Rect,
  rotation: Rotation,
  outW: number,
  outH: number,
): Matrix {
  const L = rect.origin.x;
  const B = rect.origin.y;
  const W = rect.size.width;
  const H = rect.size.height;

  // Non-uniform scales chosen to hit the integer device bounds exactly.
  const sx0 = outW / W; // 0°/180°: x scale from W -> outW
  const sy0 = outH / H; // 0°/180°: y scale from H -> outH
  const sx90 = outW / H; // 90°/270°: x depends on H -> outW
  const sy90 = outH / W; // 90°/270°: y depends on W -> outH

  switch (rotation) {
    case Rotation.Degree0:
      // x' = sx0*(x-L), y' = sy0*(y-B)
      return { a: sx0, b: 0, c: 0, d: sy0, e: -sx0 * L, f: -sy0 * B };

    case Rotation.Degree270:
      // x' = sx90*(y-B)
      // y' = -sy90*(x-L) + sy90*W
      return { a: 0, b: -sy90, c: sx90, d: 0, e: -sx90 * B, f: sy90 * (L + W) };

    case Rotation.Degree180:
      // x' = -sx0*(x-L) + sx0*W
      // y' = -sy0*(y-B) + sy0*H
      return { a: -sx0, b: 0, c: 0, d: -sy0, e: sx0 * (L + W), f: sy0 * (B + H) };

    case Rotation.Degree90: // clockwise (i.e. 90° CCW)
      // x' = -sx90*(y-B) + sx90*H
      // y' =  sy90*(x-L)
      return { a: 0, b: sy90, c: -sx90, d: 0, e: sx90 * (B + H), f: -sy90 * L };
  }
}
