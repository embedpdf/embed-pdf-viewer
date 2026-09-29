import { defineKind, NO_CAPS } from './define';
import { MARKUP_FIELDS } from './fields';

/**
 * A highlight over text (`/Highlight`). Bound to the text it marks: it can be selected,
 * recoloured and deleted, never moved or resized. Made from a text
 * selection, not a drag.
 */
export const highlight = defineKind({
  name: 'highlight',
  family: 'quads',
  caps: { ...NO_CAPS, selectable: true, anchored: true, commentable: true },
  fields: MARKUP_FIELDS,
});
