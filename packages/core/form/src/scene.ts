/**
 * A widget's drawing on the page: the generator's operations, from the
 * widget's upright frame (PDF points, y up) to page space (y down), turned
 * by the widget's quarter turn about the middle of its box, as core-annotation
 * scene nodes. Paths become SVG path data; each text run becomes a `glyphs`
 * node, every character at the place the engine puts it, in the standard
 * face's CSS (its mounted program first).
 */
import type { Paint, SceneNode } from '@embedpdf/core-annotation';
import { standardFontCss, standardFontProgram, type FontProgram } from '@embedpdf/core-fonts';

import type { DrawOp, PathSegment, Rgb, WidgetDrawing } from './drawing/types';
import type { PdfRect } from './layout/variable-text';

/** Where a widget is: its box in page space, before the turn, and the turn. */
export interface WidgetPlacement {
  readonly box: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  /** Degrees clockwise, a quarter turn, about the middle of `box`. */
  readonly rotation?: number | null;
}

const hexOf = (color: Rgb): string =>
  `#${[...color]
    .map((channel) =>
      Math.round(Math.min(1, Math.max(0, channel)) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

const round = (value: number) => Number(value.toFixed(3));

export function widgetScene(drawing: WidgetDrawing, placement: WidgetPlacement): SceneNode[] {
  const { box } = placement;
  const turn = ((((placement.rotation ?? 0) % 360) + 360) % 360) as 0 | 90 | 180 | 270;
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  /** A point of the upright frame on the page: flipped to y down, then turned clockwise about the box's middle. */
  const toPage = (x: number, y: number): { x: number; y: number } => {
    const dx = box.x + x - centerX;
    const dy = box.y + (drawing.height - y) - centerY;
    switch (turn) {
      case 90:
        return { x: centerX - dy, y: centerY + dx };
      case 180:
        return { x: centerX - dx, y: centerY - dy };
      case 270:
        return { x: centerX + dy, y: centerY - dx };
      default:
        return { x: centerX + dx, y: centerY + dy };
    }
  };
  const pathData = (path: readonly PathSegment[]): string => {
    const point = (x: number, y: number) => {
      const at = toPage(x, y);
      return `${round(at.x)} ${round(at.y)}`;
    };
    return path
      .map((segment) => {
        switch (segment.op) {
          case 'rect': {
            const { x, y, width, height } = segment;
            return `M ${point(x, y)} L ${point(x + width, y)} L ${point(x + width, y + height)} L ${point(x, y + height)} Z`;
          }
          case 'move':
            return `M ${point(segment.x, segment.y)}`;
          case 'line':
            return `L ${point(segment.x, segment.y)}`;
          case 'curve':
            return `C ${point(segment.x1, segment.y1)} ${point(segment.x2, segment.y2)} ${point(segment.x, segment.y)}`;
          case 'close':
            return 'Z';
        }
      })
      .join(' ');
  };
  const clipOf = (rect: PdfRect) => {
    const corner = toPage(rect.left, rect.bottom);
    const opposite = toPage(rect.right, rect.top);
    return {
      x: Math.min(corner.x, opposite.x),
      y: Math.min(corner.y, opposite.y),
      width: Math.abs(opposite.x - corner.x),
      height: Math.abs(opposite.y - corner.y),
    };
  };
  const nodes: SceneNode[] = [];
  const walk = (ops: readonly DrawOp[], clip: SceneNode['clip']) => {
    for (const op of ops) {
      const clipped = clip ? { clip } : {};
      switch (op.kind) {
        case 'fill': {
          const paint: Paint = {
            fill: hexOf(op.color),
            ...(op.evenOdd ? { fillRule: 'evenodd' } : {}),
          };
          nodes.push({ kind: 'path', d: pathData(op.path), paint, ...clipped });
          break;
        }
        case 'stroke': {
          const paint: Paint = {
            stroke: hexOf(op.color),
            width: op.width,
            ...(op.dash ? { dash: [...op.dash] } : {}),
          };
          nodes.push({ kind: 'path', d: pathData(op.path), paint, ...clipped });
          break;
        }
        case 'clip':
          walk(op.ops, clipOf(op.rect));
          break;
        case 'text': {
          const css = standardFontCss(op.font);
          for (const run of op.runs) {
            const offsets: number[] = [];
            let along = 0;
            for (const advance of run.advances) {
              offsets.push(round(along));
              along += advance;
            }
            const at = toPage(run.x, run.y);
            nodes.push({
              kind: 'glyphs',
              at: { x: round(at.x), y: round(at.y) },
              text: run.text,
              offsets,
              fontSize: op.size,
              fontFamily: css.fontFamily,
              fontWeight: css.fontWeight,
              fontStyle: css.fontStyle,
              ...(turn ? { rotation: turn } : {}),
              paint: { fill: hexOf(op.color) },
              ...clipped,
            });
          }
          break;
        }
      }
    }
  };
  walk(drawing.ops, undefined);
  return nodes;
}

/** The font programs a drawing's text is drawn in: mount them for its glyphs to be the engine's. */
export function drawingPrograms(drawing: WidgetDrawing): FontProgram[] {
  const fonts = new Set<Parameters<typeof standardFontProgram>[0]>();
  const walk = (ops: readonly DrawOp[]) => {
    for (const op of ops) {
      if (op.kind === 'text') fonts.add(op.font);
      else if (op.kind === 'clip') walk(op.ops);
    }
  };
  walk(drawing.ops);
  return [...fonts].map((font) => standardFontProgram(font));
}
