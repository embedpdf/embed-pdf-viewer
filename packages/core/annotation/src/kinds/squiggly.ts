import { defineKind, NO_CAPS } from './define';
import { MARKUP_FIELDS } from './fields';

/**
 * A wavy line under text (`/Squiggly`). Bound to the text it marks: it can be selected,
 * recoloured and deleted, never moved or resized. Made from a text
 * selection, not a drag.
 */
export const squiggly = defineKind({
  name: 'squiggly',
  family: 'quads',
  caps: { ...NO_CAPS, selectable: true, anchored: true, commentable: true },
  fields: MARKUP_FIELDS,
});
