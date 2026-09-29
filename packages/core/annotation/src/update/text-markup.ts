/**
 * Annotations over selected text: highlight, underline, squiggly and strikeout
 * from the text's quads, carets at a text position, and replace-text (a caret
 * grouped with a strikeout). Also the live preview while the text is selected.
 */
import type { AnnotationFlags, PageRef } from '@embedpdf/engine-core/runtime';

import { DRAWN_FLAGS } from '../flags';
import { caretFromAnchor } from '../shapes/caret';
import type { Effect, Model, Subtype, TextEndAnchor, Quad } from '../types';
import { newRecord } from './changes';
import { toolStyleOf } from './session';

/** Drop degenerate segment quads (zero-length baseline or ink extent). Area is
 *  the cross product of the two edge vectors — orientation-safe. */
const usableQuads = (quads: Quad[]): Quad[] =>
  quads.filter((quad) => {
    const ux = quad.upperRight.x - quad.upperLeft.x;
    const uy = quad.upperRight.y - quad.upperLeft.y;
    const sx = quad.lowerLeft.x - quad.upperLeft.x;
    const sy = quad.lowerLeft.y - quad.upperLeft.y;
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
  segmentQuads: Quad[],
  preset: string = subtype,
  flags?: Partial<AnnotationFlags>,
): [Model, Effect[]] {
  const quads = usableQuads(segmentQuads);
  if (!quads.length) return [model, []];
  const annotation = newRecord(model, {
    page,
    subtype,
    geometry: { kind: 'quads', quadPoints: quads },
    style: toolStyleOf(model, subtype, preset).style,
    flags: { ...DRAWN_FLAGS, ...flags },
  });
  const id = annotation.id;
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
  segmentQuads: Quad[],
  anchor: TextEndAnchor,
  preset = 'replace-text',
): [Model, Effect[]] {
  const quads = usableQuads(segmentQuads);
  if (!quads.length) return [model, []];
  const style = toolStyleOf(model, 'strikeout', preset).style;
  const caret = newRecord(model, {
    page,
    subtype: 'caret',
    intent: 'replace',
    geometry: caretFromAnchor(anchor),
    style,
    flags: DRAWN_FLAGS,
  });
  const primaryId = caret.id;
  const strikeout = newRecord(
    model,
    {
      page,
      subtype: 'strikeout',
      intent: 'strikeout-text-edit',
      geometry: { kind: 'quads', quadPoints: quads },
      style,
      flags: DRAWN_FLAGS,
      irt: primaryId,
      group: primaryId,
    },
    { offset: 2, reply: { to: caret.annotation.ref, type: 'group' } },
  );
  const strikeoutId = strikeout.id;
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
  const caretGeom = caretFromAnchor(anchor);
  if (caretGeom.box.width <= 0 || caretGeom.box.height <= 0) return [model, []];
  const annotation = newRecord(model, {
    page,
    subtype: 'caret',
    geometry: caretGeom,
    style: toolStyleOf(model, 'caret').style,
    flags: { ...DRAWN_FLAGS, ...flags },
  });
  const id = annotation.id;
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
  quadsByPage: Record<number, Quad[]>,
  preset: string = subtype,
): [Model, Effect[]] {
  const byPage: Record<number, Quad[]> = {};
  for (const key in quadsByPage) {
    const quads = usableQuads(quadsByPage[key]);
    if (quads.length) byPage[Number(key)] = quads;
  }
  return [{ ...model, preview: { subtype, preset, byPage } }, []];
}
