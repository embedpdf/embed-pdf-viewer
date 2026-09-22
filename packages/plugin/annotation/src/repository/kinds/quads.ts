/**
 * The quad-bound kinds: text markup (highlight/underline/squiggly/strikeout),
 * caret, and redact. Their `/QuadPoints` are text-anchored — set at create and
 * never patched — so markup and text-redact have no editable geometry (the
 * full projection is their geometry fallback), while an area redact and a
 * caret are box-like and move by `/Rect`.
 */
import { type ModelAnnotation, type TextQuad } from '@embedpdf/core-annotation';
import { normalizeQuad } from '@embedpdf/core-geometry';
import type { AnnotationDTO, PdfRect } from '@embedpdf/engine-core/runtime';

import type { KindProjection } from '../projection';
import {
  boxGeomFields,
  colorToCss,
  contentToPdfPoint,
  contentToPdfRect,
  fromPdfRotation,
  pdfToContentPoint,
  pdfToContentRect,
} from '../seam';

type PdfPt = { x: number; y: number };
type QuadDTO = { p1: PdfPt; p2: PdfPt; p3: PdfPt; p4: PdfPt };

/**
 * Imported `/QuadPoints` → semantic TextQuads. `normalizeQuad` is a
 * normalizer, not a cast: the de-facto zigzag order passes through, ring-order
 * producers are repaired, and garbage gets a deterministic labeling — so
 * drawing code can never put an underline on the wrong edge of a well-formed
 * quad, rotated ones included.
 */
const quadsFromDTO = (quadPoints: QuadDTO[], crop: PdfRect): TextQuad[] =>
  quadPoints.map((quad) =>
    normalizeQuad({
      p1: pdfToContentPoint(quad.p1, crop),
      p2: pdfToContentPoint(quad.p2, crop),
      p3: pdfToContentPoint(quad.p3, crop),
      p4: pdfToContentPoint(quad.p4, crop),
    }),
  );

/** Content quads → engine `/QuadPoints` (PDF user space, zigzag slot order:
 *  p1..p4 = upper-start, upper-end, lower-start, lower-end — under the y-flip
 *  exactly PDFium's documented TL, TR, BL, BR); null off quads geom. */
export function quadPointsFor(annotation: ModelAnnotation, crop: PdfRect): QuadDTO[] | null {
  if (annotation.geometry.kind !== 'quads') return null;
  return annotation.geometry.quads.map((quad) => ({
    p1: contentToPdfPoint(quad.upperStart, crop),
    p2: contentToPdfPoint(quad.upperEnd, crop),
    p3: contentToPdfPoint(quad.lowerStart, crop),
    p4: contentToPdfPoint(quad.lowerEnd, crop),
  }));
}

/** PDF-space bounding box of a set of `/QuadPoints` quads — the `/Rect` a
 *  quad-bearing draft must carry alongside its quads. */
export const pdfBoundsOfQuads = (quads: QuadDTO[]): PdfRect => {
  let left = Infinity;
  let bottom = Infinity;
  let right = -Infinity;
  let top = -Infinity;
  for (const quad of quads) {
    for (const point of [quad.p1, quad.p2, quad.p3, quad.p4]) {
      if (point.x < left) left = point.x;
      if (point.x > right) right = point.x;
      if (point.y < bottom) bottom = point.y;
      if (point.y > top) top = point.y;
    }
  }
  return { left, bottom, right, top };
};

const markupProjection = (subtype: 'highlight' | 'underline' | 'squiggly' | 'strikeout') => {
  const projection: KindProjection = {
    ingest: (dto, crop) => {
      const markupDto = dto as Extract<AnnotationDTO, { subtype: typeof subtype }>;
      return {
        geometry: { kind: 'quads', quads: quadsFromDTO(markupDto.quadPoints, crop) },
        ...(subtype === 'strikeout' && 'intent' in markupDto && markupDto.intent
          ? { intent: markupDto.intent }
          : {}),
      };
    },
    // /QuadPoints geometry isn't edited after create.
    geometry: () => null,
    draftExtras: (annotation, crop) => {
      const quads = quadPointsFor(annotation, crop);
      if (!quads) return null;
      return {
        quadPoints: quads,
        ...(subtype === 'strikeout' && annotation.intent === 'strikeout-text-edit'
          ? { intent: annotation.intent }
          : {}),
      };
    },
  };
  return projection;
};

export const highlight = markupProjection('highlight');
export const underline = markupProjection('underline');
export const squiggly = markupProjection('squiggly');
export const strikeout = markupProjection('strikeout');

export const caret: KindProjection = {
  ingest: (dto, crop) => {
    const caretDto = dto as Extract<AnnotationDTO, { subtype: 'caret' }>;
    // Box-family rotation pair: when present, the model's `rect` is the
    // logical (unrotated) box and `rot` the tilt — the free-text/shape rule.
    const rot = caretDto.rotation ? fromPdfRotation(caretDto.rotation) : 0;
    const box = rot && caretDto.unrotatedRect ? caretDto.unrotatedRect : caretDto.rect;
    return {
      geometry: { kind: 'caret', rect: pdfToContentRect(box, crop), ...(rot ? { rot } : {}) },
      ...(caretDto.intent ? { intent: caretDto.intent } : {}),
    };
  },
  geometry: (annotation, crop) =>
    annotation.geometry.kind === 'caret'
      ? boxGeomFields(annotation.geometry.rect, annotation.geometry.rot ?? 0, crop)
      : null,
  // The fixed drawn-symbol inset + the replace-text intent + seeded contents
  // are create-only statements.
  draftExtras: (annotation) => ({
    rectDifferences: { left: 0.5, top: 0.5, right: 0.5, bottom: 0.5 },
    ...(annotation.intent === 'replace' ? { intent: annotation.intent } : {}),
    ...(annotation.data?.contents != null ? { contents: annotation.data.contents } : {}),
  }),
};

export const redact: KindProjection = {
  ingest: (dto, crop) => {
    const redactDto = dto as Extract<AnnotationDTO, { subtype: 'redact' }>;
    // Text redaction carries per-line quads; an area redaction is rect-only
    // (`/Rect` is the removal region per ISO 32000-2), so its geometry is a
    // box and it moves/resizes like a shape.
    const geometry: ModelAnnotation['geometry'] =
      redactDto.quadPoints.length > 0
        ? { kind: 'quads', quads: quadsFromDTO(redactDto.quadPoints, crop) }
        : { kind: 'rect', rect: pdfToContentRect(redactDto.rect, crop), ellipse: false };
    return {
      geometry,
      // The label is `/DA`-styled exactly like free text; `fontSize` 0 means
      // auto-fit and round-trips verbatim (the engine's convention).
      text: {
        fontFamily: redactDto.fontFamily,
        fontSize: redactDto.fontSize,
        fontColor: colorToCss(redactDto.fontColor),
        textAlign: redactDto.textAlign,
      },
      ...(redactDto.overlayText
        ? { label: { text: redactDto.overlayText, repeat: redactDto.repeat } }
        : {}),
    };
  },
  // Only an area mark's box moves/resizes; text-mark quads are create-only.
  geometry: (annotation, crop) =>
    annotation.geometry.kind === 'rect'
      ? { rect: contentToPdfRect(annotation.geometry.rect, crop) }
      : null,
  draftExtras: (annotation, crop) => {
    const quads = quadPointsFor(annotation, crop);
    // Text redaction: quads + their PDF bounding box as `/Rect` (the engine
    // requires an explicit rect). Area redaction: the geometry group has it.
    return quads ? { quadPoints: quads, rect: pdfBoundsOfQuads(quads) } : {};
  },
};
