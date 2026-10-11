/**
 * What a widget's appearance draws, in the generator's own terms: fills,
 * strokes, a clip and runs of text, in the widget's upright frame (PDF
 * points, y up, the origin at the frame's bottom left). One operation for
 * each thing the engine's appearance stream paints, so the parity gate can
 * compare them one by one, and the scene can draw them.
 */
import type { StandardFont } from '@embedpdf/engine-core/runtime';

import type { PdfRect } from '../layout/variable-text';

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

/** A run of text on one baseline, each character after the one before. */
export interface TextRun {
  /** Where the baseline starts. */
  readonly x: number;
  readonly y: number;
  /** The characters as drawn (a password field's are `*`). */
  readonly text: string;
  /** Each character's advance, in points. */
  readonly advances: readonly number[];
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
      readonly font: StandardFont;
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
   * Why the drawing may differ from the engine's picture (a font that isn't
   * one of the 14, a character its font can't write); `null` when it doesn't.
   */
  readonly approximate: string | null;
}
