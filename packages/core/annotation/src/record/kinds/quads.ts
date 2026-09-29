/**
 * The text-bound kinds: text markup (highlight/underline/squiggly/strikeout),
 * caret, and redact. Their shapes are their families' (`shapes/quads.ts`,
 * `shapes/caret.ts`, and `shapes/box.ts` for an area redaction); what a kind
 * adds here is beside its shape: a strikeout's or caret's intent, a
 * redaction's label style, and what a new mark states.
 */
import type { AnnotationDTO, PageBox, PageQuad } from '@embedpdf/engine-core/runtime';

import type { RecordFields } from '../../types';
import type { KindProjection } from '../projection';

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
      return subtype === 'strikeout' && 'intent' in markupDto && markupDto.intent
        ? { intent: markupDto.intent }
        : {};
    },
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
    return caretDto.intent ? { intent: caretDto.intent } : {};
  },
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
    // The label is `/DA`-styled exactly like free text; `fontSize` 0 means
    // auto-fit and round-trips verbatim (the engine's convention).
    return {
      text: {
        fontFamily: redactDto.fontFamily,
        fontSize: redactDto.fontSize,
        fontColor: redactDto.fontColor,
        textAlign: redactDto.textAlign,
      },
    };
  },
  draftExtras: (annotation) => {
    const quads = quadPointsFor(annotation);
    // Text redaction: quads + the box around them as `rect` (the engine
    // requires an explicit rect). Area redaction: the geometry group has it.
    return quads ? { quadPoints: quads, rect: boundsOfQuads(quads) } : {};
  },
};
