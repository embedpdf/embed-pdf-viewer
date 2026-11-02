/**
 * What a shown widget looks like now: the engine's picture, or the painter's
 * drawing of it (`@embedpdf/core-form`).
 *
 * A widget's look is everything its picture depends on: its size and turn,
 * its style, and what it shows (the value, as this session formatted it). Its
 * place isn't (a move keeps the look), nor the state a toggle shows (its
 * picture of every state is held). A widget is `pending` while its look in
 * the view isn't its confirmed look: a value typed or calculated, a restyle,
 * a field just placed. The layer then draws the painter's scene, as it does
 * while the picture it holds is older than the widget's look.
 */
import { memoByKey, type Mirror } from '@embedpdf/core';
import type { SceneNode } from '@embedpdf/core-annotation';
import {
  paints,
  textEditorLayout,
  widgetDrawing,
  widgetScene,
  widgetText,
  type ShownValue,
  type TextEditorLayout,
} from '@embedpdf/core-form';
import { standardFontCss, standardFontOf } from '@embedpdf/core-fonts';
import {
  isStandardFontName,
  type AnnotationRef,
  type FontName,
  type FormFieldDTO,
  type WidgetAnnotation,
} from '@embedpdf/engine-core/runtime';
import type { FontCss, FontsCapability, PaintFonts } from '@embedpdf/plugin-fonts/contract';

import {
  fieldForWidget,
  pictureVersionOf,
  shownWidgetsOf,
  widgetRowOf,
  type Box,
  type FieldIndex,
  type ShownWidget,
} from '../model';
import type { FormDesign } from './design';
import type { FormattedTexts } from './formatted';

const NOTHING_SHOWN: readonly ShownWidget[] = Object.freeze([]);

/** A widget as the painter draws it: its scene on the page (its text carries the faces it needs). */
export interface WidgetPainting {
  readonly scene: readonly SceneNode[];
}

const numberOf = (ref: AnnotationRef): number =>
  ref.kind === 'objectNumber' ? ref.objectNumber : -1;

export type WidgetLooks = ReturnType<typeof createWidgetLooks>;

export function createWidgetLooks({
  fields,
  formatted,
  design,
  fonts,
}: {
  readonly fields: Mirror<FieldIndex>;
  readonly formatted: FormattedTexts;
  readonly design: FormDesign;
  /**
   * The fonts plugin, when installed: the fonts the painter and the editor draw a widget's
   * text in, as the engine picks them.
   */
  readonly fonts: () => FontsCapability | null;
}) {
  /** Moves when the fonts plugin may draw a widget's text differently. */
  const fontsEpoch = (): number => fonts()?.getPaintFontsEpoch() ?? 0;

  /**
   * The fonts `row` draws `text` in: the fonts plugin's (`null` while it finds them), else
   * `undefined`, the widget's standard font.
   */
  const paintFontsOf = (row: WidgetAnnotation, text: string): PaintFonts | null | undefined =>
    fonts()?.getPaintFonts(row.fontFamily ?? 'helvetica', text);

  /** What the widget's picture depends on, as one string. */
  const lookKeyOf = (row: WidgetAnnotation, field: FormFieldDTO | null): string => {
    const box = row.box ?? row.rect;
    const content = (() => {
      switch (field?.family) {
        case 'text':
          return [
            formatted.textOf(field) ?? field.value,
            field.multiline,
            field.password,
            field.comb,
            field.maxLength,
          ];
        case 'combobox':
          return [formatted.textOf(field) ?? field.value];
        case 'listbox':
          return [field.topIndex, field.options.map((option) => [option.label, option.selected])];
        default:
          return [field?.family ?? null];
      }
    })();
    return JSON.stringify([
      box.width,
      box.height,
      row.rotation ?? 0,
      row.color ?? null,
      row.interiorColor ?? null,
      row.strokeWidth ?? null,
      row.borderStyle ?? null,
      row.dashArray ?? null,
      row.fontFamily ?? null,
      row.fontSize ?? null,
      row.fontColor ?? null,
      row.textAlign ?? null,
      row.caption ?? null,
      row.checkStyle ?? null,
      content,
    ]);
  };

  const lookOf = (index: FieldIndex, number: number): string | null => {
    const row = widgetRowOf(index, number);
    return row ? lookKeyOf(row, fieldForWidget(index, number)) : null;
  };

  // In design mode the annotation layer draws the widgets it borrowed.
  // A widget the painter waits on the fonts for shows again once they're found.
  const shownOn = memoByKey(
    (_pageObjectNumber: number) =>
      [fields.view(), fields.get(), formatted.version(), design.lending(), fontsEpoch()] as const,
    (pageObjectNumber, view, truth, _formatted, lent): readonly ShownWidget[] =>
      lent
        ? NOTHING_SHOWN
        : shownWidgetsOf(view, pageObjectNumber, (row) => {
            const number = numberOf(row.ref);
            return {
              pending: lookOf(view, number) !== lookOf(truth, number),
              pictureVersion: pictureVersionOf(truth, number),
            };
          }),
  );

  /**
   * The painter's drawing of `row` (in the view's field, as this session formatted it) at `box`,
   * turned. While the fonts its text needs are found, `null`, so the engine's picture stays;
   * unless `now`, then in the widget's standard font.
   */
  const paint = (
    row: WidgetAnnotation,
    box: Box,
    rotation: number | null | undefined,
    now = false,
  ): readonly SceneNode[] | null => {
    const view = fields.view();
    const field = fieldForWidget(view, numberOf(row.ref));
    if (!field) return null;
    const text = formatted.textOf(field);
    const shown: ShownValue = text === null ? {} : { text };
    const painted = paintFontsOf(row, widgetText(row, field, shown));
    if (painted === null && !now) return null;
    const drawing = widgetDrawing({ ...row, box }, field, shown, painted ?? undefined);
    return drawing && widgetScene(drawing, { box, rotation });
  };

  /** The painter's drawing of a widget as the view has it; `null` for one it doesn't draw. */
  const sceneOf = memoByKey(
    (number: number) => {
      const view = fields.view();
      const row = widgetRowOf(view, number);
      const field = row ? fieldForWidget(view, number) : null;
      return [row, field, field ? formatted.textOf(field) : null, fontsEpoch()] as const;
    },
    (_number, row): WidgetPainting | null => {
      const scene = row && paint(row, row.box ?? row.rect, row.rotation);
      return scene ? { scene } : null;
    },
  );

  /**
   * How a browser draws text in a widget's font: the fonts plugin's CSS for
   * it (the first widget in a font that isn't standard reads the document's
   * fonts); without the plugin, the standard font the engine falls back to.
   */
  const fontCssOf = (font: FontName): FontCss =>
    fonts()?.getFontCss(font) ?? standardFontCss(standardFontOf(font));

  /**
   * Until the fonts plugin has found a field's fonts, the layout in its own
   * font, when it isn't a standard one: its program, the fallbacks and the
   * last resort, as the fonts plugin draws it. The layout's numbers stay the
   * standard face's until then.
   */
  const inItsFont = (layout: TextEditorLayout, font: string | null): TextEditorLayout => {
    if (!fonts() || !font || isStandardFontName(font)) return layout;
    const css = fontCssOf(font);
    return {
      ...layout,
      programs: css.programs,
      fontFamily: css.fontFamily,
      fontWeight: css.fontWeight,
      fontStyle: css.fontStyle,
    };
  };

  return {
    listShownWidgets: (pageObjectNumber: number) => shownOn(pageObjectNumber),
    getWidgetPainting: (ref: AnnotationRef) => sceneOf(numberOf(ref)),
    /** The widget's look in the view isn't its confirmed look yet: it draws live until its picture is. */
    isPending: (ref: AnnotationRef): boolean => {
      const number = numberOf(ref);
      return lookOf(fields.view(), number) !== lookOf(fields.get(), number);
    },
    /**
     * How the painter draws a widget row live, upright in a box (where a gesture has it); `null`
     * for one whose field it doesn't draw (a signature).
     */
    painterOf: (row: WidgetAnnotation): ((box: Box) => readonly SceneNode[]) | null => {
      const field = fieldForWidget(fields.view(), numberOf(row.ref));
      return field && paints(field) ? (box) => paint(row, box, 0, true) ?? [] : null;
    },
    getTextEditorLayout: (ref: AnnotationRef, text: string): TextEditorLayout | null => {
      const view = fields.view();
      const number = numberOf(ref);
      const row = widgetRowOf(view, number);
      const field = row ? fieldForWidget(view, number) : null;
      if (!row || !field) return null;
      const painted = paintFontsOf(row, widgetText(row, field, { text }));
      const layout = textEditorLayout(row, field, text, painted ?? undefined);
      return layout && (painted ? layout : inItsFont(layout, row.fontFamily ?? null));
    },
    getWidgetFontCss: (ref: AnnotationRef): FontCss | null => {
      const row = widgetRowOf(fields.view(), numberOf(ref));
      return row ? fontCssOf(row.fontFamily ?? 'helvetica') : null;
    },
  };
}
