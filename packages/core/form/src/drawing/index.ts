/**
 * `widgetDrawing`: what a widget looks like for its facts, as the engine's
 * appearance generator draws it. The widget row gives the look (`/MK`, `/BS`,
 * `/DA`) and the box, the field gives the family and its flags, `shown` what
 * to show now (a value this session formatted, a toggle's state), and `fonts`
 * what its text is drawn in: the widget's font, the fallbacks and the last
 * resort, as the viewer knows them.
 */
import {
  isStandardFontName,
  type FormFieldDTO,
  type WidgetAnnotation,
  type Coordinates,
  type PageCoordinates,
  type PdfRect,
} from '@embedpdf/engine-core/runtime';

import { defaultWidgetFonts, type WidgetFonts } from '../fonts';
import { borderStyleInfo, rgbOf } from './border';
import { comboBoxOps, listBoxOps, pushButtonOps, textFieldOps, type TextLook } from './text';
import { checkboxOps, radioOps } from './toggle';
import type { DrawOp, WidgetDrawing } from './types';

export type { DrawOp, PathSegment, Rgb, TextRun, WidgetDrawing } from './types';

/** What a widget shows now, where it isn't what its field holds. */
export interface ShownValue {
  /** A text field's or combo box's text: the value as this session formatted it. */
  readonly text?: string;
  /** Whether a check box or radio button is on. */
  readonly checked?: boolean;
}

const ALIGNMENT = { left: 0, center: 1, right: 2 } as const;

/**
 * The look of a widget with text, in `fonts` (the widget's standard font when
 * none are given), and whether the painter draws its font only approximately:
 * without fonts, a font that isn't one of the 14 lays out with Helvetica's
 * numbers (close, not exact).
 */
export function textLookOf<C extends Coordinates = PageCoordinates>(
  widget: WidgetAnnotation<C>,
  fonts?: WidgetFonts,
): { readonly look: TextLook; readonly approximate: string | null } {
  const box = (widget.box ?? widget.rect) as unknown as { width: number; height: number };
  const family = widget.fontFamily ?? '';
  const standard = isStandardFontName(family) ? family : null;
  return {
    look: {
      bbox: { left: 0, bottom: 0, right: box.width, top: box.height },
      border: borderStyleInfo(widget),
      background: widget.interiorColor ? rgbOf(widget.interiorColor) : null,
      borderColor: widget.color ? rgbOf(widget.color) : null,
      fonts: fonts ?? defaultWidgetFonts(widget.fontFamily),
      fontSize: widget.fontSize ?? 0,
      textColor: widget.fontColor ? rgbOf(widget.fontColor) : null,
      alignment: ALIGNMENT[widget.textAlign ?? 'left'],
    },
    approximate:
      standard === 'symbol' || standard === 'zapf-dingbats'
        ? 'symbolic-font'
        : standard || fonts
          ? null
          : 'font',
  };
}

/** Whether the painter draws this field's widgets: not a signature, nor a family the engine doesn't know. */
export const paints = (field: Pick<FormFieldDTO, 'family'>): boolean =>
  PAINTED_FAMILIES.has(field.family);

const PAINTED_FAMILIES: ReadonlySet<string> = new Set([
  'checkbox',
  'radio',
  'text',
  'combobox',
  'listbox',
  'pushbutton',
]);

/**
 * The drawing, or `null` for a widget the painter doesn't draw (a signature,
 * a family the engine doesn't know).
 */
export function widgetDrawing<C extends Coordinates = PageCoordinates>(
  widget: WidgetAnnotation<C>,
  field: FormFieldDTO<C>,
  shown: ShownValue = {},
  fonts?: WidgetFonts,
): WidgetDrawing | null {
  if (!paints(field)) return null;
  const box = (widget.box ?? widget.rect) as unknown as { width: number; height: number };
  const bbox: PdfRect = { left: 0, bottom: 0, right: box.width, top: box.height };
  const border = borderStyleInfo(widget);
  const background = widget.interiorColor ? rgbOf(widget.interiorColor) : null;
  const borderColor = widget.color ? rgbOf(widget.color) : null;
  const textColor = widget.fontColor ? rgbOf(widget.fontColor) : null;
  const drawing = (ops: DrawOp[], approximate: string | null = null): WidgetDrawing => ({
    width: box.width,
    height: box.height,
    ops,
    approximate,
  });

  if (field.family === 'checkbox' || field.family === 'radio') {
    const look = {
      bbox,
      border,
      background,
      borderColor,
      symbolColor: textColor,
      checkStyle: widget.checkStyle ?? null,
    };
    const checked =
      shown.checked ?? (widget.appearanceState !== null && widget.appearanceState !== 'Off');
    return drawing(
      field.family === 'checkbox' ? checkboxOps(look, checked) : radioOps(look, checked),
    );
  }

  const text = textLookOf(widget, fonts);
  const look = text.look;
  let approximate = text.approximate;
  const drawn =
    field.family === 'text'
      ? textFieldOps(look, {
          value: shown.text ?? field.value,
          multiline: field.multiline,
          password: field.password,
          comb: field.comb,
          maxLength: field.maxLength,
        })
      : field.family === 'combobox'
        ? comboBoxOps(look, { value: shown.text ?? field.value })
        : field.family === 'listbox'
          ? listBoxOps(look, { options: field.options, topIndex: field.topIndex })
          : pushButtonOps(look, widget.caption ?? null);
  // A box the painter drew may be a character a font it wasn't given has.
  if (drawn.missing.length > 0 && !fonts) approximate ??= 'glyph';
  return drawing(drawn.ops, approximate);
}
