import { pointsFamily } from '../shapes';
import { defineKind, NO_CAPS } from './define';
import { LINE_FIELDS } from './fields';

/** An open line through its vertices, with endings; a perimeter measurement is one (`/PolyLine`). */
export const polyline = defineKind({
  name: 'polyline',
  family: pointsFamily,
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
