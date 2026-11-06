/**
 * `widgetDrawing`: what a widget looks like for its facts, as the engine's
 * appearance generator draws it. The widget row gives the look (`/MK`, `/BS`,
 * `/DA`) and the box, the field gives the kind and its flags, `shown` what
 * to show now (a value this session formatted, a toggle's state), and `fonts`
 * what its text is drawn in: the widget's font, the fallbacks and the last
 * resort, as the viewer knows them.
 */
import { defaultPaintFonts, type PaintFonts } from '@embedpdf/core-text';
import {
  isStandardFontName,
  type FormField,
  type WidgetAnnotation,
  type Coordinates,
  type PageCoordinates,
  type PdfRect,
} from '@embedpdf/engine-core/runtime';

import { borderStyleInfo, fieldBoxOps, rgbOf } from './border';
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
  fonts?: PaintFonts,
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
      fonts: fonts ?? defaultPaintFonts(widget.fontFamily),
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

/** Whether the painter draws this field's widgets: not a kind the engine doesn't know. */
export const paints = (field: Pick<FormField, 'kind'>): boolean => PAINTED_FAMILIES.has(field.kind);

const PAINTED_FAMILIES: ReadonlySet<string> = new Set([
  'checkbox',
  'radio',
  'text',
  'combobox',
  'listbox',
  'pushbutton',
  'signature',
]);

/**
 * Every character the painter draws for a widget, as one string: what a
 * viewer finds the widget's fonts for. A password's characters are drawn as
 * `*`; a check box or a radio button draws none.
 */
export function widgetText<C extends Coordinates = PageCoordinates>(
  widget: WidgetAnnotation<C>,
  field: FormField<C>,
  shown: ShownValue = {},
): string {
  switch (field.kind) {
    case 'text': {
      const value = shown.text ?? field.value;
      return field.password && value ? '*' : value;
    }
    case 'combobox':
      return shown.text ?? field.value;
    case 'listbox':
      return field.options.map((option) => option.label).join('\n');
    case 'pushbutton':
      return widget.caption ?? '';
    default:
      return '';
  }
}

/**
 * The drawing, or `null` for a widget the painter doesn't draw: a kind the
 * engine doesn't know. A signature field's is its box, with no mark in it.
 */
export function widgetDrawing<C extends Coordinates = PageCoordinates>(
  widget: WidgetAnnotation<C>,
  field: FormField<C>,
  shown: ShownValue = {},
  fonts?: PaintFonts,
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

  if (field.kind === 'signature') {
    return drawing(fieldBoxOps(bbox, border, background, borderColor));
  }

  if (field.kind === 'checkbox' || field.kind === 'radio') {
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
      field.kind === 'checkbox' ? checkboxOps(look, checked) : radioOps(look, checked),
    );
  }

  const text = textLookOf(widget, fonts);
  const look = text.look;
  let approximate = text.approximate;
  const drawn =
    field.kind === 'text'
      ? textFieldOps(look, {
          value: shown.text ?? field.value,
          multiline: field.multiline,
          password: field.password,
          comb: field.comb,
          maxLength: field.maxLength,
        })
      : field.kind === 'combobox'
        ? comboBoxOps(look, { value: shown.text ?? field.value })
        : field.kind === 'listbox'
          ? listBoxOps(look, { options: field.options, topIndex: field.topIndex })
          : pushButtonOps(look, widget.caption ?? null);
  // A box the painter drew may be a character a font it wasn't given has.
  if (drawn.missing.length > 0 && !fonts) approximate ??= 'glyph';
  return drawing(drawn.ops, approximate);
}
