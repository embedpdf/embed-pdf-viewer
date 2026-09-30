/**
 * A record: one annotation as the core works on it (`ModelAnnotation`). The
 * engine's annotation is its only data; this folder reads it and writes
 * engine fields back:
 *
 *   identity.ts  who it is: its ref, its kind, the annotations it answers
 *   shape.ts     its shape, read by its kind's family, and a changed shape back
 *   style.ts     how it is drawn: its kind's style view
 *   text.ts      how its text is set: its kind's text view
 *   values.ts    engine fields written to it: the one door every edit uses
 *   links.ts     the rects its attached links take, and writable link targets
 *   written.ts   how it reads as the engine writes a create or an edit
 *   defaults.ts  a tool's defaults, read as an annotation (or a widget appearance)
 */
import { annotationKey } from '@embedpdf/core';
import { appearanceTurnOf, type AnnotationDTO } from '@embedpdf/engine-core/runtime';

import { geomRotation } from '../geometry';
import type { ModelAnnotation } from '../types';
import { shapeOf } from './shape';

export { groupOf, irtOf, kindOf, refOf } from './identity';
export { shapeOf, withShape } from './shape';
export { styleOf } from './style';
export { textOf } from './text';
export { withValues } from './values';
export { linkChildRects, writableTarget } from './links';
export { annotationAfter, annotationOfNew } from './written';

/**
 * The record an engine annotation reads as: keyed by its ref, drawn from the
 * engine's appearance raster (`source: 'baked'`, placed by `apBox`). Whether
 * this session draws it live instead is the appearance rule's
 * (appearance.ts).
 */
export function fromDTO(dto: AnnotationDTO): ModelAnnotation {
  // Rotation-stripped appearances (`appearanceTurnOf`, the engine's own rule):
  // a box kind drawn turned whose drawing stays inside the turned box has a
  // flat raster placed by its `box`, the stripped rotation re-applied as a
  // view transform (`apRot`). Every other raster — vertex kinds, a callout
  // (only its text box tilts), a turned drawing that reaches past its box —
  // is placed by `/Rect`, untransformed.
  const strippedRect = 'box' in dto && appearanceTurnOf(dto) !== null ? dto.box : undefined;
  return {
    id: annotationKey(dto.ref),
    source: 'baked',
    annotation: dto,
    apBox: strippedRect ?? dto.rect,
    ...(strippedRect ? { apRot: geomRotation(shapeOf(dto)) } : {}),
  };
}
