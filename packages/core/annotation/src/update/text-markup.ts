/**
 * Annotations over selected text: highlight, underline, squiggly and strikeout
 * from the text's quads, carets at a text position, and replace-text (a caret
 * grouped with a strikeout). Also the live preview while the text is selected.
 */
import type { AnnotationFlags, PageRef } from '@embedpdf/engine-core/runtime';

import { geomBounds } from '../geometry';
import { styleOf } from '../record';
import { caretFromAnchor } from '../shapes/caret';
import type { QuadsShape } from '../shapes/quads';
import type { Effect, Model, KindName, TextEndAnchor, Quad } from '../types';
import { draftOf, newRecord, numbersLeft } from './changes';
import { defaultsFor, toolAnnotation } from './session';

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
  subtype: KindName,
  page: PageRef,
  segmentQuads: Quad[],
  preset: string = subtype,
  flags?: Partial<AnnotationFlags>,
): [Model, Effect[]] {
  const quads = usableQuads(segmentQuads);
  if (!quads.length) return [model, []];
  const shape: QuadsShape = { kind: 'quads', quadPoints: quads };
  // A text redaction states the box around its quads: the engine asks for it.
  const fields = subtype === 'redact' ? { rect: geomBounds(shape) } : {};
  const created = newRecord(
    model,
    page,
    draftOf(subtype, defaultsFor(model, preset), shape, fields, flags),
  );
  const id = created.record.id;
  return [
    {
      ...model,
      objectNumbers: numbersLeft(model, 1),
      byId: { ...model.byId, [id]: created.record },
      order: [...model.order, id],
      selected: [id],
      draft: null,
      preview: null,
    },
    [{ type: 'create', id, draft: created.draft }],
  ];
}

/**
 * Create Adobe-compatible Replace Text as one logical annotation: a top-level
 * Caret (`/IT /Replace`) plus a StrikeOut subordinate (`/IT /StrikeOutTextEdit`,
 * `/IRT` caret, `/RT /Group`). Two creates, the caret first: the strikeout
 * names the caret by the object number it takes, so one change writes both.
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
  // The caret takes the strikeout tool's colour, so the pair reads as one mark.
  const strikeStyle = styleOf(toolAnnotation(model, 'strikeout', preset));
  const caret = newRecord(
    model,
    page,
    draftOf('caret', {}, caretFromAnchor(anchor), {
      color: strikeStyle.color,
      opacity: strikeStyle.opacity,
      intent: 'replace',
    }),
  );
  const primaryId = caret.record.id;
  const strikeout = newRecord(
    model,
    page,
    draftOf(
      'strikeout',
      defaultsFor(model, preset),
      { kind: 'quads', quadPoints: quads },
      { intent: 'strikeout-text-edit' },
    ),
    { offset: 2, reply: { to: caret.record.annotation.ref, type: 'group' } },
  );
  const strikeoutId = strikeout.record.id;
  return [
    {
      ...model,
      objectNumbers: numbersLeft(model, 2),
      byId: { ...model.byId, [primaryId]: caret.record, [strikeoutId]: strikeout.record },
      order: [...model.order, primaryId, strikeoutId],
      selected: [primaryId, strikeoutId],
      draft: null,
      preview: null,
    },
    [
      { type: 'create', id: primaryId, draft: caret.draft },
      { type: 'create', id: strikeoutId, draft: strikeout.draft },
    ],
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
  const created = newRecord(
    model,
    page,
    draftOf('caret', defaultsFor(model, 'caret'), caretGeom, {}, flags),
  );
  const id = created.record.id;
  return [
    {
      ...model,
      objectNumbers: numbersLeft(model, 1),
      byId: { ...model.byId, [id]: created.record },
      order: [...model.order, id],
      selected: [id],
      draft: null,
      preview: null,
    },
    [{ type: 'create', id, draft: created.draft }],
  ];
}

/** Set / replace the live markup preview from the selection's per-page quads. */
export function setMarkupPreview(
  model: Model,
  subtype: KindName,
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
