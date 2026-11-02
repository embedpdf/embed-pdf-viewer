/**
 * The numbers the engine lays text out with in a standard font: each
 * character's advance, and the ascent and descent. They are the built-in
 * face's own (PDFium draws a standard font a document doesn't embed with it),
 * not AFM's: the advances come from the face's glyphs, the ascent and
 * descent from its font box.
 */
import type { StandardFont } from '@embedpdf/engine-core/runtime';

import { FACES } from './faces.generated';

export interface StandardFontMetrics {
  readonly font: StandardFont;
  /** In 1/1000 em. */
  readonly ascent: number;
  /** In 1/1000 em, below the baseline (negative). */
  readonly descent: number;
  /** The characters the face's encoding writes, in code order. */
  readonly codePoints: readonly number[];
  /**
   * A character's advance in 1/1000 em; `null` when the face's encoding
   * can't write it (the engine draws it with another font).
   */
  advance(codePoint: number): number | null;
}

const cache = new Map<StandardFont, StandardFontMetrics>();

export function standardFontMetrics(font: StandardFont): StandardFontMetrics {
  const known = cache.get(font);
  if (known) return known;
  const face = FACES[font];
  const advances = new Map<number, number>();
  face.codePoints.forEach((codePoint, index) => advances.set(codePoint, face.advances[index]!));
  const metrics: StandardFontMetrics = {
    font,
    ascent: face.ascent,
    descent: face.descent,
    codePoints: face.codePoints,
    advance: (codePoint) => advances.get(codePoint) ?? null,
  };
  cache.set(font, metrics);
  return metrics;
}
