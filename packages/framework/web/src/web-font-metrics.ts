/**
 * Acrobat's line model, stated in CSS — private to the rich text binding.
 *
 * The engine lays a line out the way Acrobat does: the line box is the
 * face's ascent + descent (its `hhea` metrics) + a constant 0.2 × size of
 * leading, with the baseline at the ascent and the leading entirely below.
 * The standard 14 carry no font program, so the engine uses the metrics of
 * Acrobat's bundled substitutes (Helvetica 0.83/0.17, Times 0.784/0.216,
 * Courier 0.627/0.373); any other face — a registered font, an embedded
 * one — uses its own `hhea` table.
 *
 * Canvas provides browser metrics, which can be rounded or differ from the
 * font program's metrics. They approximate the registered font's line model;
 * standard families use the engine's known values below. CSS still chooses
 * wrapping and combines mixed runs differently from the engine.
 *
 * One thing CSS cannot express: it centres a line's leading (half above the
 * glyphs), and the substitute face's ascent differs from the engine's, so
 * the first baseline can land lower by the half-leading plus that ascent
 * gap. The binding compensates using the body's face and size; mixed runs
 * remain approximate.
 */

export interface WebFontMetrics {
  /** Ascent above the baseline, per em. */
  ascent: number;
  /** Descent below the baseline, per em. */
  descent: number;
}

/** A face's approximate CSS line model. */
export interface LineModel {
  ascent: number;
  descent: number;
  /** Unitless CSS line height: ascent + descent + Acrobat's 0.2 leading. */
  lineHeight: number;
}

/** Acrobat's leading: a constant share of the size, never the font's lineGap. */
export const ACROBAT_LEADING = 0.2;

/** The engine's metrics for the standard families (Acrobat's substitutes'
 *  `hhea`), keyed the engine's way: no case, spaces, hyphens, quotes. */
const STANDARD_METRICS: Record<string, WebFontMetrics> = {
  helvetica: { ascent: 0.83, descent: 0.17 },
  arial: { ascent: 0.83, descent: 0.17 },
  arialmt: { ascent: 0.83, descent: 0.17 },
  times: { ascent: 0.784, descent: 0.216 },
  timesroman: { ascent: 0.784, descent: 0.216 },
  timesnewroman: { ascent: 0.784, descent: 0.216 },
  courier: { ascent: 0.627, descent: 0.373 },
  couriernew: { ascent: 0.627, descent: 0.373 },
};

/** What the browser resolves when nothing can be measured: a one-em content
 *  area, the ascent of the engine's Helvetica. */
const FALLBACK_METRICS: WebFontMetrics = { ascent: 0.83, descent: 0.17 };

function familyKey(family: string): string {
  return family.toLowerCase().replace(/[\s\-_'"]/g, '');
}

/** The first family of a CSS family list, unquoted. */
export function firstFamily(cssFamily: string): string {
  return (cssFamily.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '');
}

// Reuse the canvas, never its measurements: a font can be registered,
// replaced or removed after a fallback face was measured. FontFaceSet.check
// also returns true for missing fonts, so it cannot validate a result cache.
const CONTEXTS = new WeakMap<Document, CanvasRenderingContext2D>();

/**
 * The browser's own ascent and descent for a CSS family list, per em,
 * measured through a canvas. `null` when the platform cannot measure
 * (no canvas, no `fontBoundingBoxAscent`). Reads the currently resolved face
 * on every call, including while the intended font is loading.
 */
export function webFontMetrics(
  cssFamily: string,
  doc: Document | undefined = typeof document === 'undefined' ? undefined : document,
  face: { weight?: number | string; style?: string } = {},
): WebFontMetrics | null {
  if (!doc) return null;
  let ctx = CONTEXTS.get(doc);
  if (!ctx) {
    const context = doc.createElement('canvas').getContext('2d');
    if (!context) return null;
    ctx = context;
    CONTEXTS.set(doc, ctx);
  }
  ctx.font = `${face.style ?? 'normal'} ${face.weight ?? 400} 100px ${cssFamily}`;
  const m = ctx.measureText('Hg') as TextMetrics & {
    fontBoundingBoxAscent?: number;
    fontBoundingBoxDescent?: number;
  };
  if (typeof m.fontBoundingBoxAscent !== 'number' || typeof m.fontBoundingBoxDescent !== 'number') {
    return null;
  }
  return {
    ascent: m.fontBoundingBoxAscent / 100,
    descent: m.fontBoundingBoxDescent / 100,
  };
}

/**
 * The standard families' engine metrics, or a browser approximation for
 * other families. `measure` is injectable for tests and resolved face styles.
 */
export function lineModelFor(
  cssFamily: string,
  measure: (cssFamily: string) => WebFontMetrics | null = webFontMetrics,
): LineModel {
  const metrics =
    STANDARD_METRICS[familyKey(firstFamily(cssFamily))] ?? measure(cssFamily) ?? FALLBACK_METRICS;
  return {
    ascent: metrics.ascent,
    descent: metrics.descent,
    lineHeight: Math.round((metrics.ascent + metrics.descent + ACROBAT_LEADING) * 1000) / 1000,
  };
}

/**
 * Screen px to raise a box's first line by so its baseline matches the
 * engine's: CSS puts half the leading above the glyphs and draws them with
 * the browser's face, whose ascent differs from the engine's for the
 * standard families. `fontSize` in screen px.
 */
export function firstLineShiftFor(
  cssFamily: string,
  fontSize: number,
  measure: (cssFamily: string) => WebFontMetrics | null = webFontMetrics,
): number {
  const model = lineModelFor(cssFamily, measure);
  const web = measure(cssFamily) ?? { ascent: model.ascent, descent: model.descent };
  const cssBaseline = (model.lineHeight - (web.ascent + web.descent)) / 2 + web.ascent;
  return Math.round((cssBaseline - model.ascent) * fontSize * 100) / 100;
}
