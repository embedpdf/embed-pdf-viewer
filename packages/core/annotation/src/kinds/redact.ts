import type { Annotation } from '@embedpdf/engine-core/runtime';

import { boxFamily, familyChosenBy, quadsFamily } from '../shapes';
import { defineKind, NO_CAPS } from './define';
import { FILL, fontFamily, OPACITY, textAlign } from './fields';
import { redactStyle } from './styles';
import { labelText } from './texts';

/** A mark over text has its quads; an area mark has none, and its shape is its rect, a box. */
const markShape = familyChosenBy((annotation: Annotation) =>
  annotation.subtype === 'redact' && annotation.quadPoints.length > 0 ? quadsFamily : boxFamily,
);

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
  family: markShape,
  style: redactStyle,
  text: labelText,
  caps: {
    ...NO_CAPS,
    paintsBeneath: true,
    selectable: true,
    movable: true,
    resizable: true,
    anchored: true,
    commentable: true,
    hasFill: true,
  },
  properties: [
    { key: 'color', control: 'color', label: 'Outline' },
    FILL,
    OPACITY,
    { key: 'overlayText', control: 'text', label: 'Label' },
    fontFamily('Label font'),
    { key: 'fontSize', control: 'number', label: 'Label size', min: 0, max: 96, step: 1 },
    { key: 'fontColor', control: 'color', label: 'Label color' },
    textAlign('Align'),
  ],
});
