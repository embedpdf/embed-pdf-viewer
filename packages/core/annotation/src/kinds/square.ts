import { defineKind, NO_CAPS } from './define';
import { SHAPE_FIELDS } from './fields';

/** A rectangle, stroked and optionally filled, with a plain or cloudy border (`/Square`). */
export const square = defineKind({
  name: 'square',
  family: 'box',
  caps: {
    ...NO_CAPS,
    selectable: true,
    movable: true,
    resizable: true,
    rotatable: true,
    groupMovable: true,
    groupResizable: true,
    groupRotatable: true,
    commentable: true,
    hasFill: true,
    hasCloudy: true,
  },
  fields: SHAPE_FIELDS,
});
