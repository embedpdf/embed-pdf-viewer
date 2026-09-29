import { boxFamily } from '../shapes';
import { defineKind, NO_CAPS } from './define';
import { LINKABLE } from './fields';

/**
 * A link (`/Link`): an invisible rectangle that goes somewhere when clicked.
 * It draws nothing of its own (an appearance a PDF baked shows in the page's
 * raster); its whole box is grabbable, so the link tool can edit it. Its
 * `link` field is its own target (`/A`): the one kind where that field isn't
 * an attached child. It doesn't turn: a link has no reading direction.
 */
export const link = defineKind({
  name: 'link',
  family: boxFamily,
  caps: {
    ...NO_CAPS,
    selectable: true,
    movable: true,
    resizable: true,
    groupMovable: true,
    opaqueBody: true,
  },
  fields: [LINKABLE],
});
