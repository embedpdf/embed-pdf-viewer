/**
 * What a widget's appearance draws, in the generator's own terms: fills,
 * strokes, a clip and runs of text, in the widget's upright frame (PDF
 * points, y up, the origin at the frame's bottom left). One operation for
 * each thing the engine's appearance stream paints, so the parity gate can
 * compare them one by one, and the scene can draw them.
 */
import type { PdfRect } from '@embedpdf/engine-core/runtime';

import type { PaintFont } from '../fonts';

/** A colour as the stream paints it: red, green and blue from 0 to 1. */
export type Rgb = readonly [number, number, number];

export type PathSegment =
  | {
      readonly op: 'rect';
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    }
  | { readonly op: 'move'; readonly x: number; readonly y: number }
  | { readonly op: 'line'; readonly x: number; readonly y: number }
  | {
      readonly op: 'curve';
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
      readonly x: number;
      readonly y: number;
    }
  | { readonly op: 'close' };

/** Text one font draws in one direction, on one baseline. */
export interface TextRun {
  /** Where its left edge meets the baseline. */
  readonly x: number;
  readonly y: number;
  /** Its characters in typing order (a password field's are `*`). */
  readonly text: string;
  readonly font: PaintFont;
  /** Drawn right to left: its first character on the right. */
  readonly rtl: boolean;
  /** Kerning and ligatures off: a simple script or a standard font, as the engine draws it. */
  readonly plain: boolean;
  /** In points. */
  readonly width: number;
}

export type DrawOp =
  | {
      readonly kind: 'fill';
      readonly path: readonly PathSegment[];
      readonly color: Rgb;
      readonly evenOdd: boolean;
    }
  | {
      readonly kind: 'stroke';
      readonly path: readonly PathSegment[];
      readonly color: Rgb;
      readonly width: number;
      readonly dash: readonly number[] | null;
    }
  | { readonly kind: 'clip'; readonly rect: PdfRect; readonly ops: readonly DrawOp[] }
  | {
      readonly kind: 'text';
      readonly size: number;
      readonly color: Rgb;
      readonly runs: readonly TextRun[];
    };

export interface WidgetDrawing {
  /** The upright frame's size, in points: the widget's box. */
  readonly width: number;
  readonly height: number;
  readonly ops: readonly DrawOp[];
  /**
   * Why the drawing may differ from the engine's picture: `'font'`, a font the
   * painter wasn't given; `'symbolic-font'`, Symbol or Zapf Dingbats;
   * `'glyph'`, a character drawn as a box, which a font the painter wasn't
   * given may have. `null` when it doesn't.
   */
  readonly approximate: string | null;
}
