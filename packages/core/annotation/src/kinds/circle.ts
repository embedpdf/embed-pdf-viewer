import { boxFamily } from '../shapes';
import { defineKind, NO_CAPS } from './define';
import { SHAPE_FIELDS } from './fields';
import { strokedStyle } from './styles';

/** An ellipse in its box, stroked and optionally filled, with a plain or cloudy border (`/Circle`). */
export const circle = defineKind({
  name: 'circle',
  family: boxFamily,
  style: strokedStyle,
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
  properties: SHAPE_FIELDS,
});
