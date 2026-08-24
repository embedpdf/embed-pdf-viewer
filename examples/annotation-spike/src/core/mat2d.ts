/**
 * 2D affine matrix — the one geometry primitive. [a,b,c,d,e,f] is the same
 * sextuple as CSS matrix(), CGAffineTransform and android.graphics.Matrix, so
 * it ports 1:1 to every platform. Pure, DOM-free, Rust-portable.
 *
 *   | a c e |   maps (x,y) → (a·x + c·y + e,  b·x + d·y + f)
 *   | b d f |
 *   | 0 0 1 |
 */
export type Mat2D = readonly [number, number, number, number, number, number];
export interface Pt {
  x: number;
  y: number;
}

export const IDENTITY: Mat2D = [1, 0, 0, 1, 0, 0];
export const translate = (tx: number, ty: number): Mat2D => [1, 0, 0, 1, tx, ty];
export const scale = (sx: number, sy: number): Mat2D => [sx, 0, 0, sy, 0, 0];
export const rotate = (rad: number): Mat2D => {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [c, s, -s, c, 0, 0];
};

/** (m ∘ n): apply n first, then m. */
export function compose(m: Mat2D, n: Mat2D): Mat2D {
  const [a1, b1, c1, d1, e1, f1] = m;
  const [a2, b2, c2, d2, e2, f2] = n;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

export function invert(m: Mat2D): Mat2D {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

export const apply = (m: Mat2D, p: Pt): Pt => {
  const [a, b, c, d, e, f] = m;
  return { x: a * p.x + c * p.y + e, y: b * p.x + d * p.y + f };
};

/** Rotation angle (radians) encoded in a translate∘rotate∘scale matrix (positive scale). */
export const angleOf = (m: Mat2D): number => Math.atan2(m[1], m[0]);

/** Scale about a LOCAL anchor (post-multiplied — happens in the shape's own frame). */
export const scaleAbout = (anchor: Pt, sx: number, sy: number): Mat2D =>
  compose(translate(anchor.x, anchor.y), compose(scale(sx, sy), translate(-anchor.x, -anchor.y)));

/** Rotate about a point in the PAGE frame (pre-multiplied). */
export const rotateAbout = (c: Pt, rad: number): Mat2D =>
  compose(translate(c.x, c.y), compose(rotate(rad), translate(-c.x, -c.y)));
