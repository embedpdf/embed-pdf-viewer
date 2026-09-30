import { boxFamily } from '../shapes';
import { defineKind, NO_CAPS } from './define';
import { LINKABLE, OPACITY } from './fields';
import { stampStyle } from './styles';

/**
 * A stamp (`/Stamp`): an image or drawing whose look is always the engine's
 * appearance, made when it was created, never drawn live. Its one style field
 * is opacity, which the engine paints over the whole drawing; a move, resize,
 * turn or new opacity is re-baked by the engine.
 */
export const stamp = defineKind({
  name: 'stamp',
  family: boxFamily,
  style: stampStyle,
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
    opaqueBody: true,
    rasterOnly: true,
  },
  fields: [OPACITY, LINKABLE],
});
