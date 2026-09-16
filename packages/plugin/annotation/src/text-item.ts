/**
 * The free-text presentation projection: the core's geometry-only `textBoxes`
 * joined with the DTO-derived font + CSS into render-ready {@link TextItem}s. This
 * is the text analogue of the core's `scene()` "paint" for shapes — it lives in
 * the plugin (not the portable core) because the font→CSS stack mapping and the
 * engine `Color`→CSS seam are web concerns, shared across every web framework.
 */
import {
  initialTextStyle,
  textBoxes,
  textPlateInset,
  type Model,
  type ViewEnv,
} from '@embedpdf/core-annotation';
import {
  cssFontFamilyForFont,
  engineAscentForFont,
  richDocOf,
  stripBodyDefaults,
} from './rich-text';
import type { TextItem } from './types';

/** The rich engine's line advance for the standard families as a ratio of
 *  the size: ascent + descent (1.0 × size for Helvetica, Times and Courier)
 *  + Acrobat's 0.2 × size leading (the measured line model, plan §4.4). A
 *  RATIO, not a length: each run's line box then scales with its own size,
 *  so a larger run makes its line taller exactly as the engine does. */
const RICH_LINE_HEIGHT = 1.2;

/** Project the model's free-text boxes into render-ready {@link TextItem}s — the
 *  core geometry (`textBoxes`) joined with the DTO-derived CSS. Pure; memoized by
 *  model identity at the call site so selectors get a stable reference. */
export function buildTextItems(m: Model, pon: number, view?: ViewEnv): TextItem[] {
  return textBoxes(m, pon, view).map((tb) => {
    const a = m.byId[tb.id];
    // `text`/`style` are the OPTIMISTIC content projections (a props edit lands
    // here before the engine round-trips), so the editor restyles instantly.
    const t = a?.text ?? initialTextStyle;
    // The text plate MIRRORS the engine's AP generator, so the DOM text sits
    // exactly where the baked text will land (WYSIWYG across the baked↔live
    // swap): the box deflated by twice the border width, plain box and
    // callout alike (`textPlateInset`, Acrobat's rule), at the rich engine's
    // line advance, 1.2 × size (ascent + descent + Acrobat's leading) — the
    // one engine every box lays out through.
    const sw = a?.style.strokeWidth ?? 0;
    const doc = a ? richDocOf(a) : null;
    return {
      id: tb.id,
      ref: a?.ref ?? null,
      box: tb.box,
      contents: a?.data?.contents ?? '',
      // Paragraph alignment/direction equal to the body's is inherited, not
      // an override: the element carries the body's (`css.align`), so a
      // block must not pin itself to a resolved value — or the Align
      // buttons (which move the body) would stop moving the text.
      richText: {
        paragraphs: doc ? stripBodyDefaults(doc.paragraphs, doc.body) : [{ runs: [{ text: '' }] }],
      },
      editing: tb.editing,
      ...(tb.rot ? { rot: tb.rot } : {}),
      css: {
        fontFamily: cssFontFamilyForFont(t.fontFamily),
        fontSize: t.fontSize,
        lineHeight: RICH_LINE_HEIGHT,
        ascent: engineAscentForFont(t.fontFamily),
        color: t.fontColor,
        fontWeight: t.bold ? 700 : 400,
        fontStyle: t.italic ? 'italic' : 'normal',
        textDecoration: t.underline ? 'underline' : 'none',
        align: t.textAlign,
        padding: textPlateInset(sw),
      },
    };
  });
}
