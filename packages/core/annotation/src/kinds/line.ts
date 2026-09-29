import { defineKind, NO_CAPS } from './define';
import { LINE_FIELDS } from './fields';

/** A straight line between two points, with endings; a distance measurement is one (`/Line`). */
export const line = defineKind({
  name: 'line',
  family: 'line',
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
    hasEndings: true,
  },
  fields: LINE_FIELDS,
});
