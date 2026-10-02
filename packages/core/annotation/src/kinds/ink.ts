import { pointsFamily } from '../shapes';
import { defineKind, NO_CAPS } from './define';
import { BLEND_MODE, COLOR, LINKABLE, OPACITY, STROKE_WIDTH } from './fields';
import { strokedStyle } from './styles';

/**
 * Freehand strokes (`/Ink`). It moves and turns as a whole, and scales in a
 * group, but has no handles of its own: the strokes are its geometry.
 */
export const ink = defineKind({
  name: 'ink',
  family: pointsFamily,
  style: strokedStyle,
  caps: {
    ...NO_CAPS,
    selectable: true,
    movable: true,
    rotatable: true,
    groupMovable: true,
    groupResizable: true,
    groupRotatable: true,
    commentable: true,
  },
  properties: [COLOR, OPACITY, STROKE_WIDTH, BLEND_MODE, LINKABLE],
});
