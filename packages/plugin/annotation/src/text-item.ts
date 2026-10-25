/**
 * The free-text presentation projection: the core's geometry-only `textBoxes`
 * joined with the DTO-derived font + CSS into render-ready {@link TextItem}s. This
 * is the text analogue of the core's `scene()` "paint" for shapes, shared across
 * every web framework. The fonts are the text fonts' (the programs the engine
 * draws with), else the standard font the engine falls back to.
 */
import { standardFontCss, standardFontOf } from '@embedpdf/core-fonts';
import {
  type FontLookup,
  initialTextStyle,
  type Model,
  refOf,
  richDocOf,
  textBoxes,
  textPlateInset,
  type ViewEnv,
} from '@embedpdf/core-annotation';
import type { PageRef } from '@embedpdf/engine-core/runtime';

import type { TextItem } from './contract';
import type { TextFonts } from './read/text-fonts';
import { stripBodyDefaults } from './rich-text';
import { styleOf, textOf } from '@embedpdf/core-annotation';

type Programs = TextItem['programs'];

/** Project the model's free-text boxes into render-ready {@link TextItem}s — the
 *  core geometry (`textBoxes`) joined with the DTO-derived CSS. Pure; memoized by
 *  model identity at the call site so selectors get a stable reference. */
export function buildTextItems(
  model: Model,
  page: PageRef,
  view?: ViewEnv,
  fonts?: { lookup: FontLookup; text: TextFonts },
): TextItem[] {
  return textBoxes(model, page, view).map((tb) => {
    const record = model.byId[tb.id];
    // The text shows the user's pending change (a props edit lands here
    // before the engine confirms it), so the editor restyles instantly.
    const style = (record && textOf(record.annotation)) ?? initialTextStyle;
    // Match the engine's text plate inset. Browser font metrics and line
    // heights belong to the shared editor binding.
    const sw = record ? styleOf(record.annotation).strokeWidth : 0;
    const doc = record ? richDocOf(record.annotation, fonts?.lookup) : null;
    const face = doc
      ? { family: doc.body.family, weight: doc.body.weight, italic: doc.body.italic }
      : { family: 'Helvetica', weight: 400, italic: false };
    const bodyCss =
      fonts?.text.bodyCss(tb.id, style, face) ?? standardFontCss(standardFontOf(style.fontFamily));
    return {
      id: tb.id,
      ref: refOf(record),
      box: tb.box,
      contents: record?.annotation.contents ?? '',
      // Paragraph alignment/direction equal to the body's is inherited, not
      // an override: the element carries the body's (`css.align`), so a
      // block must not pin itself to a resolved value — or the Align
      // buttons (which move the body) would stop moving the text.
      richText: {
        paragraphs: doc ? stripBodyDefaults(doc.paragraphs, doc.body) : [{ runs: [{ text: '' }] }],
      },
      face,
      programs:
        fonts && doc
          ? programsOf(tb.id, doc, face, bodyCss.programs, fonts.text)
          : bodyCss.programs,
      editing: tb.editing,
      ...(tb.rot ? { rot: tb.rot } : {}),
      css: {
        fontFamily: bodyCss.fontFamily,
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

/** The programs a box's text is drawn in: the body's, then those of each face a run names. */
function programsOf(
  id: string,
  doc: ReturnType<typeof richDocOf>,
  body: { family: string; weight: number; italic: boolean },
  bodyPrograms: Programs,
  text: TextFonts,
): Programs {
  const programs = [...bodyPrograms];
  for (const paragraph of doc.paragraphs) {
    for (const run of paragraph.runs) {
      const own = run.style;
      if (own?.family === undefined && own?.weight === undefined && own?.italic === undefined) {
        continue;
      }
      const css = text.faceCss(id, {
        family: own.family ?? body.family,
        weight: own.weight ?? body.weight,
        italic: own.italic ?? body.italic,
      });
      for (const program of css.programs) {
        if (!programs.some((known) => known.hash === program.hash)) programs.push(program);
      }
    }
  }
  return programs;
}
