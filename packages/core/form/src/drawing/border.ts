/**
 * The pieces every widget's appearance shares, ported from the generator:
 * rectangles as PDFium shrinks them, the border style's numbers
 * (`GetBorderStyleInfo`: a beveled or inset border counts double), the
 * border itself (`GenerateBorderAP`), and the box a check box or a push
 * button draws (`BuildCheckboxBoxStream`).
 */
import type { WidgetBorderStyle } from '@embedpdf/engine-core/runtime';

import type { DrawOp, PathSegment, Rgb } from './types';
import type { PdfRect } from '../layout/variable-text';

const f32 = Math.fround;

/** ISO 32000-1 Table 166: a dashed border that names no dashes draws 3 on, 3 off. */
const DEFAULT_DASH = [3];

/** `CFX_FloatRect::Deflate`: normalized, then shrunk; it may cross itself. */
export function deflate(rect: PdfRect, x: number, y: number = x): PdfRect {
  const left = Math.min(rect.left, rect.right);
  const right = Math.max(rect.left, rect.right);
  const bottom = Math.min(rect.bottom, rect.top);
  const top = Math.max(rect.bottom, rect.top);
  return { left: f32(left + x), bottom: f32(bottom + y), right: f32(right - x), top: f32(top - y) };
}

export const rectPath = (rect: PdfRect): PathSegment => ({
  op: 'rect',
  x: rect.left,
  y: rect.bottom,
  width: f32(rect.right - rect.left),
  height: f32(rect.top - rect.bottom),
});

export const rgbOf = (hex: string): Rgb => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
];

export const BLACK: Rgb = [0, 0, 0];

export interface BorderStyleInfo {
  readonly width: number;
  readonly style: WidgetBorderStyle;
  readonly dash: readonly number[];
}

/** The border as the generator reads `/BS`: width 1 unless it says, a beveled or inset one doubled. */
export function borderStyleInfo(row: {
  readonly strokeWidth?: number;
  readonly borderStyle?: WidgetBorderStyle;
  readonly dashArray?: readonly number[] | null;
}): BorderStyleInfo {
  const style = row.borderStyle ?? 'solid';
  const width = row.strokeWidth ?? 1;
  return {
    width: style === 'beveled' || style === 'inset' ? width * 2 : width,
    style,
    dash: row.dashArray && row.dashArray.length > 0 ? row.dashArray.slice(0, 10) : DEFAULT_DASH,
  };
}

/** `GenerateBorderAP`: a combo box's, a list box's, and a text field's that isn't solid. */
export function borderOps(rect: PdfRect, info: BorderStyleInfo, color: Rgb | null): DrawOp[] {
  const width = info.width;
  if (width <= 0) return [];
  const { left, bottom, right, top } = rect;
  const half = f32(width / 2);
  const point = (x: number, y: number) => ({ x, y });
  const polyline = (points: { x: number; y: number }[]): PathSegment[] =>
    points.map((at, index) => ({ op: index === 0 ? 'move' : 'line', x: at.x, y: at.y }) as const);
  switch (info.style) {
    case 'solid':
      return color
        ? [
            {
              kind: 'fill',
              path: [rectPath(rect), rectPath(deflate(rect, width))],
              color,
              evenOdd: true,
            },
          ]
        : [];
    case 'dashed':
      return color
        ? [
            {
              kind: 'stroke',
              path: polyline([
                point(f32(left + half), f32(bottom + half)),
                point(f32(left + half), f32(top - half)),
                point(f32(right - half), f32(top - half)),
                point(f32(right - half), f32(bottom + half)),
                point(f32(left + half), f32(bottom + half)),
              ]),
              color,
              width,
              dash: info.dash,
            },
          ]
        : [];
    case 'beveled':
    case 'inset': {
      const beveled = info.style === 'beveled';
      const lightGray = beveled ? 1 : 0.5;
      const darkGray = beveled ? 0.5 : 0.75;
      const ops: DrawOp[] = [
        {
          kind: 'fill',
          path: [
            ...polyline([
              point(f32(left + half), f32(bottom + half)),
              point(f32(left + half), f32(top - half)),
              point(f32(right - half), f32(top - half)),
              point(f32(right - width), f32(top - width)),
              point(f32(left + width), f32(top - width)),
              point(f32(left + width), f32(bottom + width)),
            ]),
          ],
          color: [lightGray, lightGray, lightGray],
          evenOdd: false,
        },
        {
          kind: 'fill',
          path: [
            ...polyline([
              point(f32(right - half), f32(top - half)),
              point(f32(right - half), f32(bottom + half)),
              point(f32(left + half), f32(bottom + half)),
              point(f32(left + width), f32(bottom + width)),
              point(f32(right - width), f32(bottom + width)),
              point(f32(right - width), f32(top - width)),
            ]),
          ],
          color: [darkGray, darkGray, darkGray],
          evenOdd: false,
        },
      ];
      if (color) {
        ops.push({
          kind: 'fill',
          path: [rectPath(rect), rectPath(deflate(rect, half))],
          color,
          evenOdd: true,
        });
      }
      return ops;
    }
    case 'underline':
      return color
        ? [
            {
              kind: 'stroke',
              path: polyline([point(left, f32(bottom + half)), point(right, f32(bottom + half))]),
              color,
              width,
              dash: null,
            },
          ]
        : [];
  }
}

/** `BuildCheckboxBoxStream`: the background inside the border's middle, and the border, solid. */
export function boxOps(
  bbox: PdfRect,
  info: BorderStyleInfo,
  background: Rgb | null,
  border: Rgb | null,
): DrawOp[] {
  const width = info.width;
  const stroke = width > 0 ? deflate(bbox, f32(width / 2)) : bbox;
  const ops: DrawOp[] = [];
  if (background)
    ops.push({ kind: 'fill', path: [rectPath(stroke)], color: background, evenOdd: true });
  if (border && width > 0) {
    ops.push({ kind: 'stroke', path: [rectPath(stroke)], color: border, width, dash: null });
  }
  return ops;
}
