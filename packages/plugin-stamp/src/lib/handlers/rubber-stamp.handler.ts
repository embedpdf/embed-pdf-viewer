import {
  PdfAnnotationName,
  PdfAnnotationSubtype,
  PdfStampAnnoObject,
  Rect,
  uuidV4,
} from '@embedpdf/models';
import { HandlerFactory } from '@embedpdf/plugin-annotation';
import { applyInsertUpright, clampAnnotationToPage } from '@embedpdf/plugin-annotation';
import { RUBBER_STAMP_TOOL_ID } from '../tools';

export const rubberStampHandlerFactory: HandlerFactory<
  PdfStampAnnoObject,
  typeof RUBBER_STAMP_TOOL_ID
> = {
  annotationType: PdfAnnotationSubtype.STAMP,
  create(context) {
    const { onPreview, onCommit, getTool, pageSize, pageRotation, getToolContext } = context;

    return {
      onPointerMove: (pos) => {
        const ctx = getToolContext();
        if (!ctx?.stampSize) return;
        const { width, height } = ctx.stampSize;
        onPreview({
          type: PdfAnnotationSubtype.STAMP,
          bounds: {
            origin: { x: pos.x - width / 2, y: pos.y - height / 2 },
            size: { width, height },
          },
          data: {
            rect: {
              origin: { x: pos.x - width / 2, y: pos.y - height / 2 },
              size: { width, height },
            },
            ghostUrl: ctx.ghostUrl,
            pageRotation,
          },
        });
      },

      onPointerDown: (pos) => {
        const tool = getTool();
        const ctx = getToolContext();
        if (!tool || !ctx?.stampSize) return;

        const { width, height } = ctx.stampSize;
        const rect: Rect = {
          origin: { x: pos.x - width / 2, y: pos.y - height / 2 },
          size: { width, height },
        };

        let anno: PdfStampAnnoObject = {
          ...tool.defaults,
          rect,
          type: PdfAnnotationSubtype.STAMP,
          name: ctx.stamp.name ?? tool.defaults.name ?? PdfAnnotationName.Custom,
          subject: ctx.stamp.subject ?? tool.defaults.subject ?? 'Custom Stamp',
          flags: tool.defaults.flags ?? ['print'],
          pageIndex: context.pageIndex,
          id: uuidV4(),
          created: new Date(),
        };

        if (tool.behavior?.insertUpright) {
          anno = applyInsertUpright(anno, pageRotation, false);
        }
        anno = clampAnnotationToPage(anno, pageSize);

        onCommit(anno, { appearance: ctx.appearance });
        onPreview(null);
      },

      onPointerLeave: () => {
        onPreview(null);
      },
    };
  },
};
