/**
 * The quad-bound kinds: text markup (highlight/underline/squiggly/strikeout),
 * caret, and redact. Their `/QuadPoints` are text-anchored — set at create and
 * never patched — so markup and text-redact have no editable geometry (the
 * full projection is their geometry fallback), while an area redact and a
 * caret are box-like and move by `/Rect`.
 */
import { normalizeQuad } from '@embedpdf/core-geometry';
import type { AnnotationDTO, PageBox, PageQuad } from '@embedpdf/engine-core/runtime';

import type { ModelAnnotation, RecordFields, TextQuad } from '../../types';
import type { KindProjection } from '../projection';
import { boxGeomFields } from '../seam';

/**
 * Imported `/QuadPoints` → semantic TextQuads. `normalizeQuad` is a
 * normalizer, not a cast: the de-facto zigzag order passes through, ring-order
 * producers are repaired, and garbage gets a deterministic labeling — so
 * drawing code can never put an underline on the wrong edge of a well-formed
 * quad, rotated ones included.
 */
const quadsFromDTO = (quadPoints: PageQuad[]): TextQuad[] => quadPoints.map(normalizeQuad);

/** Content quads → engine `quadPoints`, in the zigzag slot order: p1..p4 =
 *  upper-start, upper-end, lower-start, lower-end (PDFium's documented TL,
 *  TR, BL, BR); null off quads geom. */
export function quadPointsFor(annotation: RecordFields): PageQuad[] | null {
  if (annotation.geometry.kind !== 'quads') return null;
  return annotation.geometry.quads.map((quad) => ({
    p1: quad.upperStart,
    p2: quad.upperEnd,
    p3: quad.lowerStart,
    p4: quad.lowerEnd,
  }));
}

/** The box around a set of quads — the `rect` a quad-bearing draft must carry alongside its quads. */
export const boundsOfQuads = (quads: PageQuad[]): PageBox => {
  const points = quads.flatMap((quad) => [quad.p1, quad.p2, quad.p3, quad.p4]);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
};

const markupProjection = (subtype: 'highlight' | 'underline' | 'squiggly' | 'strikeout') => {
  const projection: KindProjection = {
    ingest: (dto) => {
      const markupDto = dto as Extract<AnnotationDTO, { subtype: typeof subtype }>;
      return {
        geometry: { kind: 'quads', quads: quadsFromDTO(markupDto.quadPoints) },
        ...(subtype === 'strikeout' && 'intent' in markupDto && markupDto.intent
          ? { intent: markupDto.intent }
          : {}),
      };
    },
    // /QuadPoints geometry isn't edited after create.
    geometry: () => null,
    draftExtras: (annotation) => {
      const quads = quadPointsFor(annotation);
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
  ingest: (dto) => {
    const caretDto = dto as Extract<AnnotationDTO, { subtype: 'caret' }>;
    // A box kind: the model's `rect` is its box and `rot` its turn — the
    // free-text/shape rule.
    const rot = caretDto.rotation ?? 0;
    return {
      geometry: {
        kind: 'caret',
        rect: caretDto.box,
        ...(rot ? { rot } : {}),
      },
      ...(caretDto.intent ? { intent: caretDto.intent } : {}),
    };
  },
  geometry: (annotation) =>
    annotation.geometry.kind === 'caret'
      ? boxGeomFields(annotation.geometry.rect, annotation.geometry.rot ?? 0)
      : null,
  // The replace-text intent + seeded contents are create-only statements.
  draftExtras: (annotation) => ({
    ...(annotation.intent === 'replace' ? { intent: annotation.intent } : {}),
    ...(annotation.annotation?.contents != null
      ? { contents: annotation.annotation.contents }
      : {}),
  }),
};

export const redact: KindProjection = {
  ingest: (dto) => {
    const redactDto = dto as Extract<AnnotationDTO, { subtype: 'redact' }>;
    // Text redaction carries per-line quads; an area redaction is rect-only
    // (`/Rect` is the removal region per ISO 32000-2), so its geometry is a
    // box and it moves/resizes like a shape.
    const geometry: ModelAnnotation['geometry'] =
      redactDto.quadPoints.length > 0
        ? { kind: 'quads', quads: quadsFromDTO(redactDto.quadPoints) }
        : { kind: 'rect', rect: redactDto.rect, ellipse: false };
    return {
      geometry,
      // The label is `/DA`-styled exactly like free text; `fontSize` 0 means
      // auto-fit and round-trips verbatim (the engine's convention).
      text: {
        fontFamily: redactDto.fontFamily,
        fontSize: redactDto.fontSize,
        fontColor: redactDto.fontColor,
        textAlign: redactDto.textAlign,
      },
      ...(redactDto.overlayText
        ? { label: { text: redactDto.overlayText, repeat: redactDto.repeat } }
        : {}),
    };
  },
  // Only an area mark's box moves/resizes; text-mark quads are create-only.
  geometry: (annotation) =>
    annotation.geometry.kind === 'rect' ? { rect: annotation.geometry.rect } : null,
  draftExtras: (annotation) => {
    const quads = quadPointsFor(annotation);
    // Text redaction: quads + the box around them as `rect` (the engine
    // requires an explicit rect). Area redaction: the geometry group has it.
    return quads ? { quadPoints: quads, rect: boundsOfQuads(quads) } : {};
  },
};
