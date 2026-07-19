import type { Rect } from '@embedpdf-x/geometry';

export type AnnotationMenuPlacement = 'top' | 'right' | 'bottom' | 'left';

export interface AnnotationMenuPosition {
  left: number;
  top: number;
  transform: string;
}

/**
 * Place an upright menu around `box` (screen px). `knob` is the rotate handle's
 * screen point, when the selection has one: the menu extends ONLY the edge it
 * sits on, and ONLY when the knob protrudes past that edge — so it clears the
 * handle without ever shifting off-centre on the other axis. When the knob is on
 * another side (e.g. a 90deg shape, knob at mid-height for a `top` menu) the edge
 * is untouched and the menu stays centred on `box`.
 */
export function positionMenuAroundRect(
  box: Rect,
  placement: AnnotationMenuPlacement,
  gap: number,
  knob?: { x: number; y: number } | null,
): AnnotationMenuPosition {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  switch (placement) {
    case 'bottom': {
      const edge = Math.max(box.y + box.height, knob ? knob.y : -Infinity);
      return { left: cx, top: edge + gap, transform: 'translate(-50%, 0)' };
    }
    case 'left': {
      const edge = Math.min(box.x, knob ? knob.x : Infinity);
      return { left: edge - gap, top: cy, transform: 'translate(-100%, -50%)' };
    }
    case 'right': {
      const edge = Math.max(box.x + box.width, knob ? knob.x : -Infinity);
      return { left: edge + gap, top: cy, transform: 'translate(0, -50%)' };
    }
    case 'top':
    default: {
      const edge = Math.min(box.y, knob ? knob.y : Infinity);
      return { left: cx, top: edge - gap, transform: 'translate(-50%, -100%)' };
    }
  }
}
