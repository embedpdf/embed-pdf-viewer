/**
 * Annotations over selected text: highlight, underline, squiggly and strikeout
 * from the text's quads, carets at a text position, and replace-text (a caret
 * grouped with a strikeout). Also the live preview while the text is selected.
 */
import type { AnnotationFlags, PageRef } from '@embedpdf/engine-core/runtime';

import { DRAWN_FLAGS } from '../flags';
import { caretGeomFromAnchor } from '../geometry';
import { styleFromProps } from '../props';
import type { Effect, Model, ModelAnnotation, Subtype, TextEndAnchor, TextQuad } from '../types';
import { newRecordId } from './changes';
import { defaultsFor } from './session';

/** Drop degenerate segment quads (zero-length baseline or ink extent). Area is
 *  the cross product of the two edge vectors — orientation-safe. */
const usableQuads = (quads: TextQuad[]): TextQuad[] =>
  quads.filter((quad) => {
    const ux = quad.upperEnd.x - quad.upperStart.x;
    const uy = quad.upperEnd.y - quad.upperStart.y;
    const sx = quad.lowerStart.x - quad.upperStart.x;
    const sy = quad.lowerStart.y - quad.upperStart.y;
    return Math.abs(ux * sy - uy * sx) > 0;
  });

/**
 * Build a text-markup annotation from the selection's per-line rects. The new
 * annotation is `vector` (rendered live by the overlay) and selected, mirroring
 * `createPointer`. One call per page the selection spans. Clears any live preview.
 */
export function createMarkup(
  model: Model,
  subtype: Subtype,
  page: PageRef,
  segmentQuads: TextQuad[],
  preset: string = subtype,
  flags?: Partial<AnnotationFlags>,
): [Model, Effect[]] {
  const quads = usableQuads(segmentQuads);
  if (!quads.length) return [model, []];
  const id = newRecordId(model);
  const annotation: ModelAnnotation = {
    id,
    ref: null,
    page,
    subtype,
    geometry: { kind: 'quads', quads },
    style: styleFromProps(defaultsFor(model, preset)),
    flags: { ...DRAWN_FLAGS, ...flags },
    source: 'vector',
  };
  return [
    {
      ...model,
      seq: model.seq + 1,
      byId: { ...model.byId, [id]: annotation },
      order: [...model.order, id],
      selected: [id],
      draft: null,
      preview: null,
    },
    [{ type: 'create', id }],
  ];
}

/**
 * Create Adobe-compatible Replace Text as one optimistic logical annotation:
 * a top-level Caret (`/IT /Replace`) plus a StrikeOut subordinate
 * (`/IT /StrikeOutTextEdit`, `/IRT` caret, `/RT /Group`). Persistence performs
 * the two ordered writes and rolls the primary back if the subordinate fails.
 */
export function createReplaceText(
  model: Model,
  page: PageRef,
  segmentQuads: TextQuad[],
  anchor: TextEndAnchor,
  preset = 'replace-text',
): [Model, Effect[]] {
  const quads = usableQuads(segmentQuads);
  if (!quads.length) return [model, []];
  const primaryId = newRecordId(model);
  const strikeoutId = newRecordId(model, 2);
  const style = styleFromProps(defaultsFor(model, preset));
  const caret: ModelAnnotation = {
    id: primaryId,
    ref: null,
    page,
    subtype: 'caret',
    intent: 'replace',
    geometry: caretGeomFromAnchor(anchor),
    style,
    flags: DRAWN_FLAGS,
    source: 'vector',
  };
  const strikeout: ModelAnnotation = {
    id: strikeoutId,
    ref: null,
    page,
    subtype: 'strikeout',
    intent: 'strikeout-text-edit',
    geometry: { kind: 'quads', quads },
    style,
    flags: DRAWN_FLAGS,
    source: 'vector',
    irt: primaryId,
    group: primaryId,
  };
  return [
    {
      ...model,
      seq: model.seq + 2,
      byId: { ...model.byId, [primaryId]: caret, [strikeoutId]: strikeout },
      order: [...model.order, primaryId, strikeoutId],
      selected: [primaryId, strikeoutId],
      draft: null,
      preview: null,
    },
    [{ type: 'createGroup', primary: primaryId, members: [strikeoutId] }],
  ];
}

export function createCaret(
  model: Model,
  page: PageRef,
  anchor: TextEndAnchor,
  flags?: Partial<AnnotationFlags>,
): [Model, Effect[]] {
  const caretGeom = caretGeomFromAnchor(anchor);
  if (caretGeom.rect.width <= 0 || caretGeom.rect.height <= 0) return [model, []];
  const id = newRecordId(model);
  const definition = defaultsFor(model, 'caret');
  const annotation: ModelAnnotation = {
    id,
    ref: null,
    page,
    subtype: 'caret',
    geometry: caretGeom,
    style: styleFromProps(definition),
    flags: { ...DRAWN_FLAGS, ...flags },
    source: 'vector',
  };
  return [
    {
      ...model,
      seq: model.seq + 1,
      byId: { ...model.byId, [id]: annotation },
      order: [...model.order, id],
      selected: [id],
      draft: null,
      preview: null,
    },
    [{ type: 'create', id }],
  ];
}

/** Set / replace the live markup preview from the selection's per-page quads. */
export function setMarkupPreview(
  model: Model,
  subtype: Subtype,
  quadsByPage: Record<number, TextQuad[]>,
  preset: string = subtype,
): [Model, Effect[]] {
  const byPage: Record<number, TextQuad[]> = {};
  for (const key in quadsByPage) {
    const quads = usableQuads(quadsByPage[key]);
    if (quads.length) byPage[Number(key)] = quads;
  }
  return [{ ...model, preview: { subtype, preset, byPage } }, []];
}
