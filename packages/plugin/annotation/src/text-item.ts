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
export function buildTextItems(m: Model, page: PageRef, view?: ViewEnv): TextItem[] {
  return textBoxes(m, page, view).map((tb) => {
    const a = m.byId[tb.id];
    // `text`/`style` are the OPTIMISTIC content projections (a props edit lands
    // here before the engine round-trips), so the editor restyles instantly.
    const t = a?.text ?? initialTextStyle;
    // Match the engine's text plate inset. Browser font metrics and line
    // heights belong to the shared editor binding.
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
