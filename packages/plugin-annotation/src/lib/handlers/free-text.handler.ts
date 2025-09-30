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
import { useClickDetector } from './click-detector';

export const freeTextHandlerFactory: HandlerFactory<PdfFreeTextAnnoObject> = {
  annotationType: PdfAnnotationSubtype.FREETEXT,
  create(context) {
    const { onCommit, onPreview, getTool, pageSize, pageIndex } = context;
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
        flags: tool.defaults.flags ?? ['print'],
      };
    };

    const clickDetector = useClickDetector<PdfFreeTextAnnoObject>({
      threshold: 5,
      getTool,
      onClickDetected: (pos, tool) => {
        const defaults = getDefaults();
        if (!defaults) return;

        // TypeScript knows this is FreeTextClickBehavior
        const clickConfig = tool.clickBehavior;
        if (!clickConfig?.enabled) return;

        const { width, height } = clickConfig.defaultSize;

        // Center the text box at click position, but keep within bounds
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        const x = clamp(pos.x - halfWidth, 0, pageSize.width - width);
        const y = clamp(pos.y - halfHeight, 0, pageSize.height - height);

        const rect: Rect = {
          origin: { x, y },
          size: { width, height },
        };

        // Use defaultContent from clickBehavior if available, otherwise use tool defaults
        const contents = clickConfig.defaultContent ?? defaults.contents;

        const anno: PdfFreeTextAnnoObject = {
          ...defaults,
          contents,
          type: PdfAnnotationSubtype.FREETEXT,
          rect,
          pageIndex,
          id: uuidV4(),
          created: new Date(),
        };

        onCommit(anno);
      },
    });

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
        const start = getStart();
        if (!start) return;

        const defaults = getDefaults();
        if (!defaults) return;

        const clampedPos = clampToPage(pos);

        if (!clickDetector.hasMoved()) {
          clickDetector.onEnd(clampedPos);
        } else {
          const minX = Math.min(start.x, clampedPos.x);
          const minY = Math.min(start.y, clampedPos.y);
          const width = Math.abs(start.x - clampedPos.x);
          const height = Math.abs(start.y - clampedPos.y);

          // Ignore tiny boxes
          const rect: Rect = {
            origin: { x: minX, y: minY },
            size: { width, height },
          };

          const anno: PdfFreeTextAnnoObject = {
            ...defaults,
            type: PdfAnnotationSubtype.FREETEXT,
            rect,
            pageIndex: context.pageIndex,
            id: uuidV4(),
            created: new Date(),
          };
          onCommit(anno);
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
