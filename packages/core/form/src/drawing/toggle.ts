/**
 * Check boxes and radio buttons (`GenerateCheckboxFormAP`,
 * `GenerateRadioButtonFormAP`): the box or the circle, and, when on, the
 * symbol `/MK /CA` names (`WriteCheckSymbol`), in the `/DA` colour.
 */
import type { WidgetCheckStyle } from '@embedpdf/engine-core/runtime';
import type { PdfRect } from '@embedpdf/engine-core/runtime';

import { BLACK, boxOps, deflate, type BorderStyleInfo } from './border';
import type { DrawOp, PathSegment, Rgb } from './types';

const f32 = Math.fround;
/** PDFium's `FXSYS_BEZIER`: a quarter circle's control point distance. */
const BEZIER = f32(0.5522847498308);
/** The radio button generator's own kappa. */
const KAPPA = f32(0.5523);

export interface ToggleLook {
  readonly bbox: PdfRect;
  readonly border: BorderStyleInfo;
  readonly background: Rgb | null;
  readonly borderColor: Rgb | null;
  /** The `/DA` colour; the symbol is black without one. */
  readonly symbolColor: Rgb | null;
  readonly checkStyle: WidgetCheckStyle | null;
}

export function checkboxOps(look: ToggleLook, checked: boolean): DrawOp[] {
  const ops = boxOps(look.bbox, look.border, look.background, look.borderColor);
  if (!checked) return ops;
  const style = look.checkStyle ?? 'check';
  const body = deflate(look.bbox, look.border.width);
  ops.push(symbolOp(look, style, symbolRect(body, style, false)));
  return ops;
}

export function radioOps(look: ToggleLook, checked: boolean): DrawOp[] {
  const style = look.checkStyle ?? 'circle';
  if (style !== 'circle') {
    // Any other symbol sits in a box, as PDFium's form filler draws it.
    const ops = boxOps(look.bbox, look.border, look.background, look.borderColor);
    if (checked) {
      ops.push(
        symbolOp(look, style, symbolRect(deflate(look.bbox, look.border.width), style, true)),
      );
    }
    return ops;
  }
  const { bbox, border } = look;
  const width = border.width;
  const half = f32(width / 2);
  const centerX = f32(f32(bbox.left + bbox.right) / 2);
  const centerY = f32(f32(bbox.bottom + bbox.top) / 2);
  const radiusX = f32(f32(bbox.right - bbox.left) / 2);
  const radiusY = f32(f32(bbox.top - bbox.bottom) / 2);
  const ops: DrawOp[] = [];
  const ring = ellipse(centerX, centerY, f32(radiusX - half), f32(radiusY - half));
  if (look.background)
    ops.push({ kind: 'fill', path: ring, color: look.background, evenOdd: true });
  if (look.borderColor && width > 0) {
    ops.push({ kind: 'stroke', path: ring, color: look.borderColor, width, dash: null });
  }
  if (checked) {
    ops.push({
      kind: 'fill',
      path: ellipse(
        centerX,
        centerY,
        f32(f32(radiusX - width) * 0.5),
        f32(f32(radiusY - width) * 0.5),
      ),
      color: look.symbolColor ?? BLACK,
      evenOdd: true,
    });
  }
  return ops;
}

/** The radio generator's ellipse: from the top, clockwise, four curves, closed. */
function ellipse(cx: number, cy: number, rx: number, ry: number): PathSegment[] {
  const dx = f32(KAPPA * rx);
  const dy = f32(KAPPA * ry);
  return [
    { op: 'move', x: cx, y: f32(cy + ry) },
    {
      op: 'curve',
      x1: f32(cx + dx),
      y1: f32(cy + ry),
      x2: f32(cx + rx),
      y2: f32(cy + dy),
      x: f32(cx + rx),
      y: cy,
    },
    {
      op: 'curve',
      x1: f32(cx + rx),
      y1: f32(cy - dy),
      x2: f32(cx + dx),
      y2: f32(cy - ry),
      x: cx,
      y: f32(cy - ry),
    },
    {
      op: 'curve',
      x1: f32(cx - dx),
      y1: f32(cy - ry),
      x2: f32(cx - rx),
      y2: f32(cy - dy),
      x: f32(cx - rx),
      y: cy,
    },
    {
      op: 'curve',
      x1: f32(cx - rx),
      y1: f32(cy + dy),
      x2: f32(cx - dx),
      y2: f32(cy + ry),
      x: cx,
      y: f32(cy + ry),
    },
    { op: 'close' },
  ];
}

/** `CheckSymbolRect`: the body's middle square, shrunk for the filled shapes. */
function symbolRect(body: PdfRect, style: WidgetCheckStyle, radio: boolean): PdfRect {
  const width = f32(body.right - body.left);
  const height = f32(body.top - body.bottom);
  const half = width > height ? f32(height / 2) : f32(width / 2);
  const centerX = f32(f32(body.left + body.right) / 2);
  const centerY = f32(f32(body.top + body.bottom) / 2);
  const square: PdfRect = {
    left: f32(centerX - half),
    bottom: f32(centerY - half),
    right: f32(centerX + half),
    top: f32(centerY + half),
  };
  const scale =
    style === 'circle'
      ? radio
        ? f32(1 / 2)
        : f32(2 / 3)
      : style === 'check' || style === 'cross'
        ? 1
        : f32(2 / 3);
  if (scale === 1) return square;
  const halfWidth = f32(f32(square.right - square.left) / 2);
  const halfHeight = f32(f32(square.top - square.bottom) / 2);
  const middleX = f32(f32(square.left + square.right) / 2);
  const middleY = f32(f32(square.top + square.bottom) / 2);
  return {
    left: f32(middleX - f32(halfWidth * scale)),
    bottom: f32(middleY - f32(halfHeight * scale)),
    right: f32(middleX + f32(halfWidth * scale)),
    top: f32(middleY + f32(halfHeight * scale)),
  };
}

function symbolOp(look: ToggleLook, style: WidgetCheckStyle, rect: PdfRect): DrawOp {
  const color = look.symbolColor ?? BLACK;
  const midX = f32(f32(rect.left + rect.right) / 2);
  const midY = f32(f32(rect.bottom + rect.top) / 2);
  switch (style) {
    case 'check':
      return { kind: 'fill', path: checkmark(rect), color, evenOdd: false };
    case 'circle': {
      const rx = f32(f32(rect.right - rect.left) / 2);
      const ry = f32(f32(rect.top - rect.bottom) / 2);
      const left = { x: rect.left, y: midY };
      const top = { x: midX, y: rect.top };
      const right = { x: rect.right, y: midY };
      const bottom = { x: midX, y: rect.bottom };
      return {
        kind: 'fill',
        path: [
          { op: 'move', x: left.x, y: left.y },
          {
            op: 'curve',
            x1: left.x,
            y1: f32(left.y + f32(ry * BEZIER)),
            x2: f32(top.x - f32(rx * BEZIER)),
            y2: top.y,
            x: top.x,
            y: top.y,
          },
          {
            op: 'curve',
            x1: f32(top.x + f32(rx * BEZIER)),
            y1: top.y,
            x2: right.x,
            y2: f32(right.y + f32(ry * BEZIER)),
            x: right.x,
            y: right.y,
          },
          {
            op: 'curve',
            x1: right.x,
            y1: f32(right.y - f32(ry * BEZIER)),
            x2: f32(bottom.x + f32(rx * BEZIER)),
            y2: bottom.y,
            x: bottom.x,
            y: bottom.y,
          },
          {
            op: 'curve',
            x1: f32(bottom.x - f32(rx * BEZIER)),
            y1: bottom.y,
            x2: left.x,
            y2: f32(left.y - f32(ry * BEZIER)),
            x: left.x,
            y: left.y,
          },
        ],
        color,
        evenOdd: false,
      };
    }
    case 'cross':
      // Stroked with the line width the box's border left set (1 without a border).
      return {
        kind: 'stroke',
        path: [
          { op: 'move', x: rect.left, y: rect.top },
          { op: 'line', x: rect.right, y: rect.bottom },
          { op: 'move', x: rect.left, y: rect.bottom },
          { op: 'line', x: rect.right, y: rect.top },
        ],
        color,
        width: look.borderColor && look.border.width > 0 ? look.border.width : 1,
        dash: null,
      };
    case 'diamond':
      return {
        kind: 'fill',
        path: polygon([
          [rect.left, midY],
          [midX, rect.top],
          [rect.right, midY],
          [midX, rect.bottom],
        ]),
        color,
        evenOdd: false,
      };
    case 'square':
      return {
        kind: 'fill',
        path: polygon([
          [rect.left, rect.top],
          [rect.right, rect.top],
          [rect.right, rect.bottom],
          [rect.left, rect.bottom],
        ]),
        color,
        evenOdd: false,
      };
    case 'star': {
      // Five points joined every second one, filled by the nonzero rule.
      const radius = f32(f32(rect.top - rect.bottom) / f32(1 + f32(Math.cos(Math.PI / 5))));
      const tips: [number, number][] = [];
      let angle = f32(Math.PI / 10);
      for (let index = 0; index < 5; index += 1) {
        tips.push([
          f32(midX + f32(radius * f32(Math.cos(angle)))),
          f32(midY + f32(radius * f32(Math.sin(angle)))),
        ]);
        angle = f32(angle + f32((Math.PI * 2) / 5));
      }
      return {
        kind: 'fill',
        path: polygon([tips[0]!, tips[2]!, tips[4]!, tips[1]!, tips[3]!]),
        color,
        evenOdd: false,
      };
    }
  }
}

function polygon(points: readonly (readonly [number, number])[]): PathSegment[] {
  return [
    ...points.map(([x, y], index): PathSegment => ({ op: index === 0 ? 'move' : 'line', x, y })),
    { op: 'close' },
  ];
}

/** `GenerateCheckmarkPath`: PDFium's check, eight curves through the rect. */
const CHECK: readonly (readonly [number, number])[][] = [
  [
    [0.28, 0.52],
    [0.27, 0.48],
    [0.29, 0.4],
  ],
  [
    [0.3, 0.33],
    [0.31, 0.29],
    [0.31, 0.28],
  ],
  [
    [0.39, 0.28],
    [0.49, 0.29],
    [0.77, 0.67],
  ],
  [
    [0.76, 0.68],
    [0.78, 0.69],
    [0.76, 0.75],
  ],
  [
    [0.76, 0.75],
    [0.73, 0.8],
    [0.68, 0.75],
  ],
  [
    [0.68, 0.74],
    [0.68, 0.74],
    [0.44, 0.47],
  ],
  [
    [0.43, 0.47],
    [0.4, 0.47],
    [0.41, 0.58],
  ],
  [
    [0.4, 0.6],
    [0.28, 0.66],
    [0.3, 0.56],
  ],
];

function checkmark(rect: PdfRect): PathSegment[] {
  const width = f32(rect.right - rect.left);
  const height = f32(rect.top - rect.bottom);
  const points = CHECK.map((row) =>
    row.map(
      ([x, y]) =>
        [f32(f32(f32(x) * width) + rect.left), f32(f32(f32(y) * height) + rect.bottom)] as const,
    ),
  );
  const path: PathSegment[] = [{ op: 'move', x: points[0]![0]![0], y: points[0]![0]![1] }];
  for (let index = 0; index < points.length; index += 1) {
    const row = points[index]!;
    const next = points[(index + 1) % points.length]![0]!;
    const [x0, y0] = row[0]!;
    const px1 = f32(row[1]![0] - x0);
    const py1 = f32(row[1]![1] - y0);
    const px2 = f32(row[2]![0] - next[0]);
    const py2 = f32(row[2]![1] - next[1]);
    path.push({
      op: 'curve',
      x1: f32(x0 + f32(px1 * BEZIER)),
      y1: f32(y0 + f32(py1 * BEZIER)),
      x2: f32(next[0] + f32(px2 * BEZIER)),
      y2: f32(next[1] + f32(py2 * BEZIER)),
      x: next[0],
      y: next[1],
    });
  }
  return path;
}
