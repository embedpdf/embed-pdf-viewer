import { defineKind, NO_CAPS } from './define';
import { BLEND_MODE, COLOR, LINKABLE, OPACITY, STROKE_WIDTH } from './fields';

/**
 * Freehand strokes (`/Ink`). It moves and turns as a whole, and scales in a
 * group, but has no handles of its own: the strokes are its geometry.
 */
export const ink = defineKind({
  name: 'ink',
  family: 'ink',
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
  fields: [COLOR, OPACITY, STROKE_WIDTH, BLEND_MODE, LINKABLE],
});
