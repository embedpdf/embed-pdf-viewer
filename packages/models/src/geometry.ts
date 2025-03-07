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

/**
 * Utility function to ensure integer coordinates
 * @param value - number to be rounded
 * @returns floored integer value
 * @internal
 */
function ensureInteger(value: number): number {
  return Math.floor(value);
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
 * Swap the width and height of the size object
 * @param size - the original size
 * @returns swapped size
 *
 * @public
 */
export function swap(size: Size): Size {
  const { width, height } = size;

  return {
    width: ensureInteger(height),
    height: ensureInteger(width),
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
export function transformSize(
  size: Size,
  rotation: Rotation,
  scaleFactor: number,
) {
  size = rotation % 2 === 0 ? size : swap(size);

  return {
    width: ensureInteger(size.width * scaleFactor),
    height: ensureInteger(size.height * scaleFactor),
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
    x: ensureInteger(x),
    y: ensureInteger(y),
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
export function scalePosition(
  position: Position,
  scaleFactor: number,
): Position {
  return {
    x: ensureInteger(position.x * scaleFactor),
    y: ensureInteger(position.y * scaleFactor),
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
  return scalePosition(
    rotatePosition(containerSize, position, rotation),
    scaleFactor,
  );
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
 * Calculate the rect after rotated the container
 * @param containerSize - size of container
 * @param rect - target rect
 * @param rotation - rotation angle
 * @returns rotated rect
 *
 * @public
 */
export function rotateRect(
  containerSize: Size,
  rect: Rect,
  rotation: Rotation,
): Rect {
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
      x: ensureInteger(x),
      y: ensureInteger(y),
    },
    size: {
      width: ensureInteger(size.width),
      height: ensureInteger(size.height),
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
export function scaleRect(rect: Rect, scaleFactor: number) {
  return {
    origin: {
      x: ensureInteger(rect.origin.x * scaleFactor),
      y: ensureInteger(rect.origin.y * scaleFactor),
    },
    size: {
      width: ensureInteger(rect.size.width * scaleFactor),
      height: ensureInteger(rect.size.height * scaleFactor),
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
) {
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
) {
  return scaleRect(
    rotateRect(containerSize, rect, (4 - rotation) % 4),
    1 / scaleFactor,
  );
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
export function restoreOffset(
  offset: Position,
  rotation: Rotation,
  scaleFactor: number,
) {
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
    x: ensureInteger(offsetX),
    y: ensureInteger(offsetY),
  };
}
