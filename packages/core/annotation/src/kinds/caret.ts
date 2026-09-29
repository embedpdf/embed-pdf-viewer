import { defineKind, NO_CAPS } from './define';
import { COLOR, OPACITY } from './fields';

/** An insertion mark on text (`/Caret`), bound to it like markup; it has no blend mode. */
export const caret = defineKind({
  name: 'caret',
  family: 'caret',
  caps: { ...NO_CAPS, selectable: true, anchored: true, commentable: true },
  fields: [COLOR, OPACITY],
});
