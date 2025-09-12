import { clamp } from '@embedpdf/core';
import {
  PdfAnnotationBorderStyle,
  PdfAnnotationSubtype,
  PdfCircleAnnoObject,
  Rect,
  uuidV4,
} from '@embedpdf/models';
import { HandlerFactory, PreviewState } from './types';
import { useState } from '../utils/use-state';

export const circleHandlerFactory: HandlerFactory<PdfCircleAnnoObject> = {
  annotationType: PdfAnnotationSubtype.CIRCLE,

  create(context) {
    const { pageIndex, onCommit, onPreview, getTool, pageSize } = context;
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
        strokeWidth: tool.defaults.strokeWidth ?? 2,
        strokeColor: tool.defaults.strokeColor ?? '#000000',
        strokeStyle: tool.defaults.strokeStyle ?? PdfAnnotationBorderStyle.SOLID,
        strokeDashArray: tool.defaults.strokeDashArray ?? [],
        color: tool.defaults.color ?? '#000000',
        opacity: tool.defaults.opacity ?? 1,
      };
    };

    const getPreview = (current: {
      x: number;
      y: number;
    }): PreviewState<PdfAnnotationSubtype.CIRCLE> | null => {
      const p1 = getStart();
      if (!p1) return null;

      const minX = Math.min(p1.x, current.x);
      const minY = Math.min(p1.y, current.y);
      const width = Math.abs(p1.x - current.x);
      const height = Math.abs(p1.y - current.y);

      const defaults = getDefaults();
      if (!defaults) return null;

      const strokeWidth = defaults.strokeWidth;
      const halfStroke = strokeWidth / 2;

      const rect: Rect = {
        origin: { x: minX - halfStroke, y: minY - halfStroke },
        size: { width: width + strokeWidth, height: height + strokeWidth },
      };

      return {
        type: PdfAnnotationSubtype.CIRCLE,
        bounds: rect,
        data: {
          rect,
          ...defaults,
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
        const p1 = getStart();
        if (!p1) return;

        const defaults = getDefaults();
        if (!defaults) return;

        const clampedPos = clampToPage(pos);
        const width = Math.abs(p1.x - clampedPos.x);
        const height = Math.abs(p1.y - clampedPos.y);

        if (width >= 1 && height >= 1) {
          const preview = getPreview(clampedPos);
          if (preview) {
            const anno: PdfCircleAnnoObject = {
              ...defaults,
              type: PdfAnnotationSubtype.CIRCLE,
              flags: ['print'],
              created: new Date(),
              id: uuidV4(),
              pageIndex,
              rect: preview.data.rect,
            };
            onCommit(anno);
          }
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
