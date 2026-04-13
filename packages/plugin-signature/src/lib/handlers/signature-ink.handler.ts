import { PdfAnnotationSubtype, PdfInkAnnoObject, Rect, expandRect, uuidV4 } from '@embedpdf/models';
import { HandlerFactory } from '@embedpdf/plugin-annotation';
import { clampAnnotationToPage } from '@embedpdf/plugin-annotation';
import { SIGNATURE_INK_TOOL_ID } from '../tools';
import { SignatureFieldKind, SignatureInkData } from '../types';

function translateAndScaleInk(
  inkData: SignatureInkData,
  targetSize: { width: number; height: number },
  centerPos: { x: number; y: number },
): { inkList: Array<{ points: Array<{ x: number; y: number }> }>; strokeWidth: number } {
  const scaleX = targetSize.width / inkData.size.width;
  const scaleY = targetSize.height / inkData.size.height;
  const scale = Math.min(scaleX, scaleY);
  const scaledW = inkData.size.width * scale;
  const scaledH = inkData.size.height * scale;
  const offsetX = centerPos.x - scaledW / 2;
  const offsetY = centerPos.y - scaledH / 2;

  const inkList = inkData.inkList.map((stroke) => ({
    points: stroke.points.map((p) => ({
      x: p.x * scale + offsetX,
      y: p.y * scale + offsetY,
    })),
  }));

  return { inkList, strokeWidth: Math.round(inkData.strokeWidth * scale * 10) / 10 };
}

export const signatureInkHandlerFactory: HandlerFactory<
  PdfInkAnnoObject,
  typeof SIGNATURE_INK_TOOL_ID
> = {
  annotationType: PdfAnnotationSubtype.INK,
  create(context) {
    const { onPreview, onCommit, getTool, pageSize, getToolContext } = context;

    return {
      onPointerMove: (pos) => {
        const ctx = getToolContext();
        if (!ctx?.inkData || !ctx?.targetSize) return;

        const { inkList, strokeWidth } = translateAndScaleInk(ctx.inkData, ctx.targetSize, pos);

        const allPoints = inkList.flatMap((s) => s.points);
        if (allPoints.length === 0) return;

        const rect = expandRect(
          {
            origin: {
              x: Math.min(...allPoints.map((p) => p.x)),
              y: Math.min(...allPoints.map((p) => p.y)),
            },
            size: {
              width:
                Math.max(...allPoints.map((p) => p.x)) - Math.min(...allPoints.map((p) => p.x)),
              height:
                Math.max(...allPoints.map((p) => p.y)) - Math.min(...allPoints.map((p) => p.y)),
            },
          },
          strokeWidth / 2,
        );

        onPreview({
          type: PdfAnnotationSubtype.INK,
          bounds: rect,
          data: {
            rect,
            inkList,
            strokeWidth,
            strokeColor: ctx.inkData.strokeColor,
            opacity: 0.5,
          },
        });
      },

      onPointerDown: (pos) => {
        const tool = getTool();
        const ctx = getToolContext();
        if (!tool || !ctx?.inkData || !ctx?.targetSize) return;

        const { inkList, strokeWidth } = translateAndScaleInk(ctx.inkData, ctx.targetSize, pos);

        const allPoints = inkList.flatMap((s) => s.points);
        if (allPoints.length === 0) return;

        const rect = expandRect(
          {
            origin: {
              x: Math.min(...allPoints.map((p) => p.x)),
              y: Math.min(...allPoints.map((p) => p.y)),
            },
            size: {
              width:
                Math.max(...allPoints.map((p) => p.x)) - Math.min(...allPoints.map((p) => p.x)),
              height:
                Math.max(...allPoints.map((p) => p.y)) - Math.min(...allPoints.map((p) => p.y)),
            },
          },
          strokeWidth / 2,
        );

        let anno: PdfInkAnnoObject = {
          ...tool.defaults,
          inkList,
          rect,
          strokeWidth,
          strokeColor: ctx.inkData.strokeColor,
          opacity: 1,
          type: PdfAnnotationSubtype.INK,
          subject: 'Signature',
          flags: tool.defaults.flags ?? ['print'],
          pageIndex: context.pageIndex,
          id: uuidV4(),
          created: new Date(),
        };

        const unclamped = anno.rect;
        anno = clampAnnotationToPage(anno, pageSize);
        const dx = anno.rect.origin.x - unclamped.origin.x;
        const dy = anno.rect.origin.y - unclamped.origin.y;
        if (dx !== 0 || dy !== 0) {
          anno = {
            ...anno,
            inkList: anno.inkList.map((s) => ({
              points: s.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
            })),
          };
        }

        onCommit(anno);
        onPreview(null);
      },

      onPointerLeave: () => {
        onPreview(null);
      },
    };
  },
};
