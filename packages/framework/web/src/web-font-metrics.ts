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
 * The browser reads the same `hhea` table through the canvas
 * (`fontBoundingBoxAscent/Descent`), so for a registered font its
 * measurement IS the engine's metrics; for the standard 14 the browser
 * substitutes a different face (Arial for Helvetica…), so those come from
 * the table. A unitless `line-height` of ascent + descent + 0.2 then gives
 * every run's line box the engine's advance, per face.
 *
 * One thing CSS cannot express: it centres a line's leading (half above the
 * glyphs), and the substitute face's ascent differs from the engine's, so
 * the FIRST baseline lands lower than the engine's by the half-leading plus
 * that ascent gap. The binding raises the first block by exactly that.
 */

export interface WebFontMetrics {
  /** Ascent above the baseline, per em. */
  ascent: number;
  /** Descent below the baseline, per em. */
  descent: number;
}

/** A face's line model: the engine's ascent and its line advance ratio. */
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

const CACHE = new Map<string, WebFontMetrics>();

/**
 * The browser's own ascent and descent for a CSS family list, per em,
 * measured through a canvas. `null` when the platform cannot measure
 * (no canvas, no `fontBoundingBoxAscent`). A family the document has not
 * finished loading measures the fallback face and is not cached.
 */
export function webFontMetrics(
  cssFamily: string,
  doc: Document | undefined = typeof document === 'undefined' ? undefined : document,
): WebFontMetrics | null {
  const cached = CACHE.get(cssFamily);
  if (cached) return cached;
  if (!doc) return null;
  const canvas = doc.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const font = `100px ${cssFamily}`;
  ctx.font = font;
  const m = ctx.measureText('Hg') as TextMetrics & {
    fontBoundingBoxAscent?: number;
    fontBoundingBoxDescent?: number;
  };
  if (typeof m.fontBoundingBoxAscent !== 'number' || typeof m.fontBoundingBoxDescent !== 'number') {
    return null;
  }
  const metrics = {
    ascent: m.fontBoundingBoxAscent / 100,
    descent: m.fontBoundingBoxDescent / 100,
  };
  let loaded = true;
  try {
    loaded = !doc.fonts || doc.fonts.check(font);
  } catch {
    loaded = true;
  }
  if (loaded) CACHE.set(cssFamily, metrics);
  return metrics;
}

/**
 * The engine's line model for a CSS family list: the standard families'
 * table, else the face's own metrics as the browser measures them (the same
 * `hhea` the engine reads). `measure` is injectable for tests.
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
