import { defineKind, NO_CAPS } from './define';
import { SHAPE_FIELDS } from './fields';

/** A closed shape through its vertices, filled or not; an area measurement is one (`/Polygon`). */
export const polygon = defineKind({
  name: 'polygon',
  family: 'poly',
  caps: {
    ...NO_CAPS,
    selectable: true,
    movable: true,
    vertexEditable: true,
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
