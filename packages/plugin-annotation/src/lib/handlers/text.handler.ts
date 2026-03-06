import {
  PdfAnnotationIcon,
  PdfAnnotationSubtype,
  PdfTextAnnoObject,
  Rect,
  uuidV4,
} from '@embedpdf/models';
import { HandlerFactory } from './types';
import { clampAnnotationToPage } from '../patching';

const COMMENT_SIZE = 24;

export const textHandlerFactory: HandlerFactory<PdfTextAnnoObject> = {
  annotationType: PdfAnnotationSubtype.TEXT,
  create(context) {
    const { onCommit, getTool, pageSize } = context;

    return {
      onPointerDown: (pos) => {
        const tool = getTool();
        if (!tool) return;

        const rect: Rect = {
          origin: { x: pos.x - COMMENT_SIZE / 2, y: pos.y - COMMENT_SIZE / 2 },
          size: { width: COMMENT_SIZE, height: COMMENT_SIZE },
        };

        let anno: PdfTextAnnoObject = {
          ...tool.defaults,
          rect,
          type: PdfAnnotationSubtype.TEXT,
          icon: tool.defaults.icon ?? PdfAnnotationIcon.Comment,
          contents: tool.defaults.contents ?? '',
          flags: tool.defaults.flags ?? ['print', 'noRotate', 'noZoom'],
          pageIndex: context.pageIndex,
          id: uuidV4(),
          created: new Date(),
        };

        anno = clampAnnotationToPage(anno, pageSize);
        onCommit(anno);
      },
    };
  },
};
