import { PdfFreeTextAnnoObject, Position, Rect } from '@embedpdf/models';
import { HandlerContext, HandlerFactory } from './types';

function center(rect: Rect): Position {
  return {
    x: rect.origin.x + rect.size.width / 2,
    y: rect.origin.y + rect.size.height / 2,
  };
}

function mapRect(rect: Rect, map: (point: Position) => Position): Rect {
  const a = map(rect.origin);
  const b = map({ x: rect.origin.x + rect.size.width, y: rect.origin.y + rect.size.height });
  return {
    origin: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
    size: { width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) },
  };
}

/** Run callout layout in visual page axes, retaining the native pointer lifecycle. */
export function createUprightCalloutHandler(
  context: HandlerContext<PdfFreeTextAnnoObject>,
  factory: HandlerFactory<PdfFreeTextAnnoObject>,
) {
  const turn = context.pageRotation;
  const tool = context.getTool();
  if (!turn || !tool?.behavior?.insertUpright || tool.defaults.rotation !== undefined) {
    return factory.create(context);
  }
  const { width, height } = context.pageSize;
  const toVisual = (point: Position): Position => {
    switch (turn) {
      case 1:
        return { x: height - point.y, y: point.x };
      case 2:
        return { x: width - point.x, y: height - point.y };
      default:
        return { x: point.y, y: width - point.x };
    }
  };
  const toPage = (point: Position): Position => {
    switch (turn) {
      case 1:
        return { x: point.y, y: height - point.x };
      case 2:
        return { x: width - point.x, y: height - point.y };
      default:
        return { x: width - point.y, y: point.x };
    }
  };
  const handlers = factory.create({
    ...context,
    pageRotation: 0,
    pageSize: turn % 2 ? { width: height, height: width } : context.pageSize,
    onPreview(preview) {
      if (!preview) return context.onPreview(null);
      context.onPreview({
        ...preview,
        bounds: mapRect(preview.bounds, toPage),
        data: {
          ...preview.data,
          rect: mapRect(preview.data.rect, toPage),
          calloutLine: preview.data.calloutLine?.map(toPage),
          textBox: preview.data.textBox && mapRect(preview.data.textBox, toPage),
        },
      });
    },
    onCommit(value, createContext) {
      const visualCenter = center(value.rect);
      const pageCenter = toPage(visualCenter);
      // The annotation container rotates this local geometry around the page-space center.
      const translate = (point: Position): Position => ({
        x: point.x + pageCenter.x - visualCenter.x,
        y: point.y + pageCenter.y - visualCenter.y,
      });
      context.onCommit(
        {
          ...value,
          rect: mapRect(value.rect, toPage),
          unrotatedRect: mapRect(value.rect, translate),
          rotation: (4 - turn) * 90,
          calloutLine: value.calloutLine?.map(translate),
        },
        createContext,
      );
    },
  });
  const wrapped = { ...handlers };
  for (const key of [
    'onPointerDown',
    'onPointerMove',
    'onPointerUp',
    'onPointerEnter',
    'onPointerLeave',
    'onPointerCancel',
  ] as const) {
    const handler = handlers[key];
    if (handler) wrapped[key] = (point, event, mode) => handler(toVisual(point), event, mode);
  }
  return wrapped;
}
