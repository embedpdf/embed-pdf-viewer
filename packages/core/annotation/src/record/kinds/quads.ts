/**
 * The text-bound kinds: text markup (highlight/underline/squiggly/strikeout),
 * caret, and redact. Their shapes are read by their families
 * (`shapes/quads.ts`, `shapes/caret.ts`, and `shapes/box.ts` for an area
 * redaction). Quads are set at create and never patched, so markup and text
 * redaction have no editable geometry (the full projection is their geometry
 * fallback). A caret is written as its `box` and turn; an area redaction
 * moves by its `rect`.
 */
import type { AnnotationDTO, PageBox, PageQuad } from '@embedpdf/engine-core/runtime';

import { readBox } from '../../shapes/box';
import { readCaret, writeCaret } from '../../shapes/caret';
import { readQuads } from '../../shapes/quads';
import type { ModelGeometry, RecordFields } from '../../types';
import type { KindProjection } from '../projection';
import { boxGeometry } from './box';

/** A record's quads, as the engine's `quadPoints`; null off the quads family. */
export function quadPointsFor(annotation: RecordFields): PageQuad[] | null {
  return annotation.geometry.kind === 'quads' ? annotation.geometry.quadPoints : null;
}

/** The box around a set of quads — the `rect` a quad-bearing draft must carry alongside its quads. */
export const boundsOfQuads = (quads: PageQuad[]): PageBox => {
  const points = quads.flatMap((quad) => [
    quad.upperLeft,
    quad.upperRight,
    quad.lowerLeft,
    quad.lowerRight,
  ]);
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
        geometry: readQuads(markupDto),
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
    return {
      geometry: readCaret(caretDto),
      ...(caretDto.intent ? { intent: caretDto.intent } : {}),
    };
  },
  geometry: (annotation) =>
    annotation.geometry.kind === 'caret' ? writeCaret(annotation.geometry) : null,
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
    const geometry: ModelGeometry =
      redactDto.quadPoints.length > 0 ? readQuads(redactDto) : readBox(redactDto);
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
  geometry: boxGeometry,
  draftExtras: (annotation) => {
    const quads = quadPointsFor(annotation);
    // Text redaction: quads + the box around them as `rect` (the engine
    // requires an explicit rect). Area redaction: the geometry group has it.
    return quads ? { quadPoints: quads, rect: boundsOfQuads(quads) } : {};
  },
};
