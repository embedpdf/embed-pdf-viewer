import { caretFamily } from '../shapes';
import { defineKind, NO_CAPS } from './define';
import { COLOR, OPACITY } from './fields';
import { caretStyle } from './styles';

/** An insertion mark on text (`/Caret`), bound to it like markup; it has no blend mode. */
export const caret = defineKind({
  name: 'caret',
  family: caretFamily,
  style: caretStyle,
  caps: { ...NO_CAPS, selectable: true, anchored: true, commentable: true },
  fields: [COLOR, OPACITY],
});
