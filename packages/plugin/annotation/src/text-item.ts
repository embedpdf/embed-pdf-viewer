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
import type { PageRef } from '@embedpdf/engine-core/runtime';

import type { TextItem } from './contract';
import { cssFontFamilyForFont, richDocOf, stripBodyDefaults } from './rich-text';

/** Project the model's free-text boxes into render-ready {@link TextItem}s — the
 *  core geometry (`textBoxes`) joined with the DTO-derived CSS. Pure; memoized by
 *  model identity at the call site so selectors get a stable reference. */
export function buildTextItems(model: Model, page: PageRef, view?: ViewEnv): TextItem[] {
  return textBoxes(model, page, view).map((tb) => {
    const annotation = model.byId[tb.id];
    // `text`/`style` are the optimistic content projections (a props edit lands
    // here before the engine round-trips), so the editor restyles instantly.
    const style = annotation?.text ?? initialTextStyle;
    // Match the engine's text plate inset. Browser font metrics and line
    // heights belong to the shared editor binding.
    const sw = annotation?.style.strokeWidth ?? 0;
    const doc = annotation ? richDocOf(annotation) : null;
    return {
      id: tb.id,
      ref: annotation?.ref ?? null,
      box: tb.box,
      contents: annotation?.data?.contents ?? '',
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
        fontFamily: cssFontFamilyForFont(style.fontFamily),
        fontSize: style.fontSize,
        color: style.fontColor,
        fontWeight: style.bold ? 700 : 400,
        fontStyle: style.italic ? 'italic' : 'normal',
        textDecoration: style.underline ? 'underline' : 'none',
        align: style.textAlign,
        padding: textPlateInset(sw),
      },
    };
  });
}
