import { Rotation } from '@embedpdf/models';

/**
 * Returns the 6-tuple transformation matrix for rotation.
 * Rotation is clockwise, origin = top-left (0 0).
 *
 * ── Note on e,f ───────────────────────────────
 * For 0°/180° no translation is needed.
 * For 90°/270° you may want to pass the page
 * height / width so the page stays in positive
 * coordinates.  Keep them 0 and handle layout
 * elsewhere if that's what you do today.
 */
export function getRotationMatrix(
  rotation: Rotation,
  w: number,
  h: number,
): [number, number, number, number, number, number] {
  let a = 1,
    b = 0,
    c = 0,
    d = 1,
    e = 0,
    f = 0;

  switch (rotation) {
    case 1: // 90°
      a = 0;
      b = 1;
      c = -1;
      d = 0;
      e = h;
      break;
    case 2: // 180°
      a = -1;
      b = 0;
      c = 0;
      d = -1;
      e = w;
      f = h;
      break;
    case 3: // 270°
      a = 0;
      b = -1;
      c = 1;
      d = 0;
      f = w;
      break;
  }

  return [a, b, c, d, e, f];
}

/**
 * Returns the CSS matrix transformation string for rotation.
 * Rotation is clockwise, origin = top-left (0 0).
 */
export function getRotationMatrixString(rotation: Rotation, w: number, h: number): string {
  const [a, b, c, d, e, f] = getRotationMatrix(rotation, w, h);
  return `matrix(${a},${b},${c},${d},${e},${f})`;
}

/**
 * Returns the next rotation.
 */
export function getNextRotation(current: Rotation): Rotation {
  return ((current + 1) % 4) as Rotation;
}

/**
 * Returns the previous rotation.
 */
export function getPreviousRotation(current: Rotation): Rotation {
  return ((current + 3) % 4) as Rotation; // +3 is equivalent to -1 in modulo 4
}
