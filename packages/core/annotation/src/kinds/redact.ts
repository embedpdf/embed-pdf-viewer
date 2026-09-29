import { defineKind, NO_CAPS } from './define';
import { FILL, OPACITY } from './fields';

/**
 * A redaction mark (`/Redact`): the stage before content is removed. Made from
 * a text selection (one quad per line) or an area drag (a rect). A mark over
 * text is bound to it like markup; an area mark moves and resizes: one set of
 * caps serves both, as hit.ts gates transforms on anchored quads.
 *
 * At rest it shows an outline; its fill and label are what applying paints.
 * A label size of 0 fits the region (the engine's convention).
 */
export const redact = defineKind({
  name: 'redact',
  family: 'quads',
  caps: {
    ...NO_CAPS,
    selectable: true,
    movable: true,
    resizable: true,
    anchored: true,
    commentable: true,
    hasFill: true,
  },
  fields: [
    { key: 'color', label: 'Outline' },
    FILL,
    OPACITY,
    { key: 'fontFamily', label: 'Label font' },
    { key: 'fontSize', label: 'Label size', min: 0, max: 96, step: 1 },
    { key: 'fontColor', label: 'Label color' },
    { key: 'textAlign', label: 'Align' },
  ],
});
