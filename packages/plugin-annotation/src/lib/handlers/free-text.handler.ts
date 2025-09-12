import {
  PdfAnnotationSubtype,
  PdfFreeTextAnnoObject,
  PdfStandardFont,
  PdfTextAlignment,
  PdfVerticalAlignment,
  Rect,
  uuidV4,
} from '@embedpdf/models';
import { HandlerFactory, PreviewState } from './types';
import { useState } from '../utils/use-state';
import { clamp } from '@embedpdf/core';

export const freeTextHandlerFactory: HandlerFactory<PdfFreeTextAnnoObject> = {
  annotationType: PdfAnnotationSubtype.FREETEXT,
  create(context) {
    const { onCommit, onPreview, getTool, pageSize } = context;
    const [getStart, setStart] = useState<{ x: number; y: number } | null>(null);

    const clampToPage = (pos: { x: number; y: number }) => ({
      x: clamp(pos.x, 0, pageSize.width),
      y: clamp(pos.y, 0, pageSize.height),
    });

    const getDefaults = () => {
      const tool = getTool();
      if (!tool) return null;
      return {
        ...tool.defaults,
        fontColor: tool.defaults.fontColor ?? '#000000',
        opacity: tool.defaults.opacity ?? 1,
        fontSize: tool.defaults.fontSize ?? 12,
        fontFamily: tool.defaults.fontFamily ?? PdfStandardFont.Helvetica,
        backgroundColor: tool.defaults.backgroundColor ?? 'transparent',
        textAlign: tool.defaults.textAlign ?? PdfTextAlignment.Left,
        verticalAlign: tool.defaults.verticalAlign ?? PdfVerticalAlignment.Top,
        contents: tool.defaults.contents ?? 'Insert text here',
      };
    };

    const getPreview = (current: {
      x: number;
      y: number;
    }): PreviewState<PdfAnnotationSubtype.FREETEXT> | null => {
      const start = getStart();
      if (!start) return null;

      const defaults = getDefaults();
      if (!defaults) return null;

      const minX = Math.min(start.x, current.x);
      const minY = Math.min(start.y, current.y);
      const width = Math.abs(start.x - current.x);
      const height = Math.abs(start.y - current.y);

      const rect: Rect = {
        origin: { x: minX, y: minY },
        size: { width, height },
      };

      return {
        type: PdfAnnotationSubtype.FREETEXT,
        bounds: rect,
        data: {
          ...defaults,
          rect,
        },
      };
    };

    return {
      onPointerDown: (pos, evt) => {
        const clampedPos = clampToPage(pos);
        setStart(clampedPos);
        onPreview(getPreview(clampedPos));
        evt.setPointerCapture?.();
      },
      onPointerMove: (pos) => {
        if (getStart()) {
          const clampedPos = clampToPage(pos);
          onPreview(getPreview(clampedPos));
        }
      },
      onPointerUp: (pos, evt) => {
        const start = getStart();
        if (!start) return;

        const defaults = getDefaults();
        if (!defaults) return;

        const clampedPos = clampToPage(pos);
        const minX = Math.min(start.x, clampedPos.x);
        const minY = Math.min(start.y, clampedPos.y);
        const width = Math.abs(start.x - clampedPos.x);
        const height = Math.abs(start.y - clampedPos.y);

        // Ignore tiny boxes
        if (width >= 1 && height >= 1) {
          const rect: Rect = {
            origin: { x: minX, y: minY },
            size: { width, height },
          };

          const anno: PdfFreeTextAnnoObject = {
            ...defaults,
            type: PdfAnnotationSubtype.FREETEXT,
            rect,
            flags: ['print'],
            pageIndex: context.pageIndex,
            id: uuidV4(),
            created: new Date(),
          };
          onCommit(anno);
        }

        setStart(null);
        onPreview(null);
        evt.releasePointerCapture?.();
      },
      onPointerLeave: (_, evt) => {
        setStart(null);
        onPreview(null);
        evt.releasePointerCapture?.();
      },
      onPointerCancel: (_, evt) => {
        setStart(null);
        onPreview(null);
        evt.releasePointerCapture?.();
      },
    };
  },
};
