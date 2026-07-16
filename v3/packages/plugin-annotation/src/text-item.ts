/**
 * The free-text presentation projection: the core's geometry-only `textBoxes`
 * joined with the DTO-derived font + CSS into render-ready {@link TextItem}s. This
 * is the text analogue of the core's `scene()` "paint" for shapes — it lives in
 * the plugin (not the portable core) because the font→CSS stack mapping and the
 * engine `Color`→CSS seam are web concerns, shared across every web framework.
 */
import { initialTextStyle, textBoxes, type Model, type ViewEnv } from '@embedpdf-x/annotation-core';
import type { TextItem } from './types';

/** Map a free-text `/DA` font to a CSS font-family. A standard PDF font → a web
 *  stack with the same metrics; anything else is a registered font key → mount it
 *  as a `@font-face` of that family (see the framework `mountWebFont` helper). */
const STANDARD_FONT_CSS: Record<string, string> = {
  helvetica: 'Helvetica, Arial, sans-serif',
  'helvetica-bold': 'Helvetica, Arial, sans-serif',
  courier: '"Courier New", Courier, monospace',
  'times-roman': '"Times New Roman", Times, serif',
  symbol: 'serif',
  'zapf-dingbats': 'serif',
};
const cssFontFor = (font: string): string => STANDARD_FONT_CSS[font] ?? `"${font}", sans-serif`;

/** Project the model's free-text boxes into render-ready {@link TextItem}s — the
 *  core geometry (`textBoxes`) joined with the DTO-derived CSS. Pure; memoized by
 *  model identity at the call site so selectors get a stable reference. */
export function buildTextItems(m: Model, pon: number, view?: ViewEnv): TextItem[] {
  return textBoxes(m, pon, view).map((tb) => {
    const a = m.byId[tb.id];
    // `text`/`style` are the OPTIMISTIC content projections (a props edit lands
    // here before the engine round-trips), so the editor restyles instantly.
    const t = a?.text ?? initialTextStyle;
    return {
      id: tb.id,
      ref: a?.ref ?? null,
      box: tb.box,
      contents: a?.data?.contents ?? '',
      editing: tb.editing,
      ...(tb.rot ? { rot: tb.rot } : {}),
      css: {
        fontFamily: cssFontFor(t.fontFamily),
        fontSize: t.fontSize,
        lineHeight: t.fontSize, // CPVT lays out free-text at line-height ≈ font size
        color: t.fontColor,
        align: t.textAlign,
        padding: 2,
        background: a?.style.interiorColor ?? null,
      },
    };
  });
}
