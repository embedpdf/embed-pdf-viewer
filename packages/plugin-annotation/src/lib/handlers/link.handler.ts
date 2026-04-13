import {
  PdfAnnotationBorderStyle,
  PdfAnnotationSubtype,
  PdfLinkAnnoObject,
  Rect,
  uuidV4,
} from '@embedpdf/models';
import { HandlerFactory, PreviewState } from './types';
import { useState } from '../utils/use-state';
import { clamp } from '@embedpdf/core';
import { useClickDetector } from './click-detector';

export const linkHandlerFactory: HandlerFactory<PdfLinkAnnoObject> = {
  annotationType: PdfAnnotationSubtype.LINK,

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
        flags: tool.defaults.flags ?? ['print'],
        strokeWidth: tool.defaults.strokeWidth ?? 2,
        strokeColor: tool.defaults.strokeColor ?? '#0000FF',
        strokeStyle: tool.defaults.strokeStyle ?? PdfAnnotationBorderStyle.UNDERLINE,
        strokeDashArray: tool.defaults.strokeDashArray ?? [],
      };
    };

    const clickDetector = useClickDetector<PdfLinkAnnoObject>({
      threshold: 5,
      getTool,
      onClickDetected: (pos, tool) => {
        const defaults = getDefaults();
        if (!defaults) return;

        const clickConfig = tool.clickBehavior;
        if (!clickConfig?.enabled) return;

        const { width, height } = clickConfig.defaultSize;
        const halfWidth = width / 2;
        const halfHeight = height / 2;

        const x = clamp(pos.x - halfWidth, 0, pageSize.width - width);
        const y = clamp(pos.y - halfHeight, 0, pageSize.height - height);

        const rect: Rect = {
          origin: { x, y },
          size: { width, height },
        };

        const anno: PdfLinkAnnoObject = {
          ...defaults,
          type: PdfAnnotationSubtype.LINK,
          target: undefined,
          created: new Date(),
          id: uuidV4(),
          pageIndex,
          rect,
        };

        onCommit(anno);
      },
    });

    const getPreview = (current: {
      x: number;
      y: number;
    }): PreviewState<PdfAnnotationSubtype.LINK> | null => {
      const p1 = getStart();
      if (!p1) return null;

      const minX = Math.min(p1.x, current.x);
      const minY = Math.min(p1.y, current.y);
      const width = Math.abs(p1.x - current.x);
      const height = Math.abs(p1.y - current.y);

      const defaults = getDefaults();
      if (!defaults) return null;

      const rect: Rect = {
        origin: { x: minX, y: minY },
        size: { width, height },
      };

      return {
        type: PdfAnnotationSubtype.LINK,
        bounds: rect,
        data: {
          rect,
          strokeColor: defaults.strokeColor,
          strokeWidth: defaults.strokeWidth,
          strokeStyle: defaults.strokeStyle,
          strokeDashArray: defaults.strokeDashArray,
        },
      };
    };

    return {
      onPointerDown: (pos, evt) => {
        const clampedPos = clampToPage(pos);
        setStart(clampedPos);
        clickDetector.onStart(clampedPos);
        onPreview(getPreview(clampedPos));
        evt.setPointerCapture?.();
      },
      onPointerMove: (pos) => {
        const clampedPos = clampToPage(pos);
        clickDetector.onMove(clampedPos);

        if (getStart() && clickDetector.hasMoved()) {
          onPreview(getPreview(clampedPos));
        }
      },
      onPointerUp: (pos, evt) => {
        const p1 = getStart();
        if (!p1) return;

        const defaults = getDefaults();
        if (!defaults) return;

        const clampedPos = clampToPage(pos);

        if (!clickDetector.hasMoved()) {
          clickDetector.onEnd(clampedPos);
        } else {
          const preview = getPreview(clampedPos);
          if (preview) {
            const anno: PdfLinkAnnoObject = {
              ...defaults,
              type: PdfAnnotationSubtype.LINK,
              target: undefined,
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
        clickDetector.reset();
        evt.releasePointerCapture?.();
      },
      onPointerLeave: (_, evt) => {
        setStart(null);
        onPreview(null);
        clickDetector.reset();
        evt.releasePointerCapture?.();
      },
      onPointerCancel: (_, evt) => {
        setStart(null);
        onPreview(null);
        clickDetector.reset();
        evt.releasePointerCapture?.();
      },
    };
  },
};
