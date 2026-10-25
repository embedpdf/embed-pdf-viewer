/**
 * A text field's layout as an HTML editor needs it, so the text being typed
 * sits where the engine will draw it: the face, the size the engine draws at
 * (a fitted size resolved for this text), where the text's box sits in the
 * widget's, one line's height and a comb's spacing. In points, in the
 * widget's upright frame.
 */
import { standardFontOf, standardFontStack, type MountableFontProgram } from '@embedpdf/core-fonts';
import type { FieldText, PaintFont, PaintFonts } from '@embedpdf/core-text';
import {
  type Coordinates,
  type FormFieldDTO,
  type PageCoordinates,
  type WidgetAnnotation,
} from '@embedpdf/engine-core/runtime';

import { textLookOf } from './drawing';
import { textFieldLayout } from './drawing/text';

export interface TextEditorLayout {
  /** The programs the engine draws the text in, the face's first: mounted, `fontFamily` reaches them. */
  readonly programs: readonly MountableFontProgram[];
  readonly fontFamily: string;
  readonly fontWeight: number;
  readonly fontStyle: 'normal' | 'italic';
  /** The size the engine draws the text at. */
  readonly fontSize: number;
  /** One line, from the face's ascent to its descent. */
  readonly lineHeight: number;
  /** Where the text starts inside the widget's box, from each edge. */
  readonly padding: {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  };
  /**
   * A comb's room between characters: its cell, less a character's width. A comb starts its first
   * character at `padding.left`, whatever the field's alignment. `0` for a field without one.
   */
  readonly letterSpacing: number;
  readonly comb: boolean;
  /**
   * The text reads right to left, as the engine draws it: its first strong
   * character is (Hebrew, Arabic). An editor reads the line in the same
   * direction, so a line of mixed scripts is ordered as the engine orders it.
   */
  readonly rtl: boolean;
}

/**
 * The CSS family list that draws text in `programs`, then the look-alikes of
 * the face's standard font (Helvetica's for any other) for before they load.
 */
function familyList(fonts: PaintFonts, programs: readonly MountableFontProgram[]): string {
  const stack = standardFontStack(standardFontOf(fonts.face.key));
  return [...programs.map((program) => `"${program.family}"`), stack].join(', ');
}

/**
 * The programs that draw `laid`, each once, in the order they're tried: the
 * face's first, then the fallbacks its text is drawn in (a browser loads no
 * other), then the last resort's.
 */
function programsOf(fonts: PaintFonts, laid: FieldText<PaintFont>): MountableFontProgram[] {
  const drawn = new Set(laid.lines.flatMap((line) => line.runs.map((run) => run.font)));
  const all = [
    fonts.face,
    ...fonts.fallbacks.filter((font) => drawn.has(font)),
    ...(fonts.lastResort ? [fonts.lastResort] : []),
  ];
  return [...new Map(all.map((font) => [font.program.family, font.program])).values()];
}

/**
 * The layout of `text` in the widget's field, in `fonts` (the widget's
 * standard font when none are given); `null` for a widget that isn't a text
 * field's.
 */
export function textEditorLayout<C extends Coordinates = PageCoordinates>(
  widget: WidgetAnnotation<C>,
  field: FormFieldDTO<C>,
  text: string,
  fonts?: PaintFonts,
): TextEditorLayout | null {
  if (field.family !== 'text') return null;
  const { look } = textLookOf(widget, fonts);
  const facts = {
    multiline: field.multiline,
    password: field.password,
    comb: field.comb,
    maxLength: field.maxLength,
  };
  const { plate, laid } = textFieldLayout(look, { ...facts, value: text });
  const { bbox } = look;
  const { face } = look.fonts;
  const fontSize = laid.fontSize;
  const programs = programsOf(look.fonts, laid);
  const base = {
    programs,
    fontFamily: familyList(look.fonts, programs),
    fontWeight: face.fontWeight,
    fontStyle: face.fontStyle,
    fontSize,
    lineHeight: ((face.ascent - face.descent) * fontSize) / 1000,
    rtl: laid.rtl,
    padding: {
      top: bbox.top - plate.top,
      right: bbox.right - plate.right,
      bottom: plate.bottom - bbox.bottom,
      left: plate.left - bbox.left,
    },
  };
  const cells = field.comb ? (field.maxLength ?? 0) : 0;
  if (cells === 0) return { ...base, letterSpacing: 0, comb: false };

  // A comb centres each character in its cell: CSS can only space them evenly, so the room is
  // the cell less the characters' mean width (exact for a fixed-width face). An empty comb
  // places a stand-in, for where the first character will go.
  const placed = text ? laid : textFieldLayout(look, { ...facts, value: '0' }).laid;
  const runs = placed.lines.flatMap((line) => line.runs);
  const mean = runs.reduce((sum, run) => sum + run.width, 0) / Math.max(1, runs.length);
  const cell = (plate.right - plate.left) / cells;
  return {
    ...base,
    padding: { ...base.padding, left: (runs[0]?.x ?? plate.left) - bbox.left },
    letterSpacing: cell - mean,
    comb: true,
  };
}
