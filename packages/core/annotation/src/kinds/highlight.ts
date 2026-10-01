import { quadsFamily } from '../shapes';
import { defineKind, NO_CAPS } from './define';
import { MARKUP_FIELDS } from './fields';
import { markupStyle } from './styles';

/**
 * A highlight over text (`/Highlight`). Bound to the text it marks: it can be selected,
 * recoloured and deleted, never moved or resized. Made from a text
 * selection, not a drag.
 */
export const highlight = defineKind({
  name: 'highlight',
  family: quadsFamily,
  style: markupStyle,
  caps: { ...NO_CAPS, paintsBeneath: true, selectable: true, anchored: true, commentable: true },
  properties: MARKUP_FIELDS,
});
