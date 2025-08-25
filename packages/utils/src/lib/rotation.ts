import { Rect, Rotation } from '@embedpdf/models';

interface CounterTransformResult {
  matrix: string; // CSS matrix(a,b,c,d,e,f)
  width: number; // new width
  height: number; // new height
}

/**
 * Given an already-placed rect (left/top/width/height in px) and the page rotation,
 * return the counter-rotation matrix + adjusted width/height.
 *
 * transform-origin is expected to be "0 0".
 * left/top DO NOT change, apply them as-is.
 */
export function getCounterRotation(rect: Rect, rotation: Rotation): CounterTransformResult {
  const { width: w, height: h } = rect.size;

  switch (rotation % 4) {
    case 1: // 90° cw → need matrix(0,-1,1,0,0,h) and swap w/h
      return {
        matrix: `matrix(0, -1, 1, 0, 0, ${h})`,
        width: h,
        height: w,
      };

    case 2: // 180° → matrix(-1,0,0,-1,w,h), width/height unchanged
      return {
        matrix: `matrix(-1, 0, 0, -1, ${w}, ${h})`,
        width: w,
        height: h,
      };

    case 3: // 270° cw → matrix(0,1,-1,0,w,0), swap w/h
      return {
        matrix: `matrix(0, 1, -1, 0, ${w}, 0)`,
        width: h,
        height: w,
      };

    default:
      return {
        matrix: `matrix(1, 0, 0, 1, 0, 0)`,
        width: w,
        height: h,
      };
  }
}
