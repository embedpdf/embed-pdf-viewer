/**
 * A text field's layout as an HTML editor needs it, so the text being typed
 * sits where the engine will draw it: the face, the size the engine draws at
 * (a fitted size resolved for this text), where the text's box sits in the
 * widget's, one line's height and a comb's spacing. In points, in the
 * widget's upright frame.
 */
import {
  standardFontCss,
  standardFontProgram,
  type MountableFontProgram,
} from '@embedpdf/core-fonts';
import type {
  Coordinates,
  FormFieldDTO,
  PageCoordinates,
  WidgetAnnotation,
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
}

/** The layout of `text` in the widget's field; `null` for a widget that isn't a text field's. */
export function textEditorLayout<C extends Coordinates = PageCoordinates>(
  widget: WidgetAnnotation<C>,
  field: FormFieldDTO<C>,
  text: string,
): TextEditorLayout | null {
  if (field.family !== 'text') return null;
  const { look } = textLookOf(widget);
  const facts = {
    multiline: field.multiline,
    password: field.password,
    comb: field.comb,
    maxLength: field.maxLength,
  };
  const { plate, layout } = textFieldLayout(look, { ...facts, value: text });
  const { bbox, font } = look;
  const fontSize = layout.fontSize;
  const base = {
    programs: [standardFontProgram(font.font)],
    ...standardFontCss(font.font),
    fontSize,
    lineHeight: ((font.ascent - font.descent) * fontSize) / 1000,
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
  const placed = text ? layout : textFieldLayout(look, { ...facts, value: '0' }).layout;
  const words = placed.lines.flatMap((line) => line.words);
  const advances = words.map((word) => ((font.width(word.code) ?? 0) * placed.fontSize) / 1000);
  const mean = advances.reduce((sum, advance) => sum + advance, 0) / Math.max(1, advances.length);
  const cell = (plate.right - plate.left) / cells;
  return {
    ...base,
    padding: { ...base.padding, left: (words[0]?.x ?? plate.left) - bbox.left },
    letterSpacing: cell - mean,
    comb: true,
  };
}
