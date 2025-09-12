import {
  PdfAnnotationBorderStyle,
  PdfAnnotationLineEnding,
  PdfAnnotationSubtype,
  PdfLineAnnoObject,
  uuidV4,
} from '@embedpdf/models';
import { HandlerFactory, PreviewState } from './types';
import { useState } from '../utils/use-state';
import * as patching from '../patching';
import { clamp } from '@embedpdf/core';

export const lineHandlerFactory: HandlerFactory<PdfLineAnnoObject> = {
  annotationType: PdfAnnotationSubtype.LINE,
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
        strokeWidth: tool.defaults.strokeWidth ?? 1,
        lineEndings: tool.defaults.lineEndings ?? {
          start: PdfAnnotationLineEnding.None,
          end: PdfAnnotationLineEnding.None,
        },
        color: tool.defaults.color ?? '#000000',
        opacity: tool.defaults.opacity ?? 1,
        strokeStyle: tool.defaults.strokeStyle ?? PdfAnnotationBorderStyle.SOLID,
        strokeDashArray: tool.defaults.strokeDashArray ?? [],
        strokeColor: tool.defaults.strokeColor ?? '#000000',
      };
    };

    const getPreview = (current: {
      x: number;
      y: number;
    }): PreviewState<PdfAnnotationSubtype.LINE> | null => {
      const start = getStart();
      if (!start) return null;

      const defaults = getDefaults();
      if (!defaults) return null;

      const bounds = patching.lineRectWithEndings(
        [start, current],
        defaults.strokeWidth,
        defaults.lineEndings,
      );

      return {
        type: PdfAnnotationSubtype.LINE,
        bounds,
        data: {
          ...defaults,
          rect: bounds,
          linePoints: { start, end: current },
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

        // Ignore tiny lines
        if (Math.abs(clampedPos.x - start.x) > 2 || Math.abs(clampedPos.y - start.y) > 2) {
          const rect = patching.lineRectWithEndings(
            [start, clampedPos],
            defaults.strokeWidth,
            defaults.lineEndings,
          );
          onCommit({
            ...defaults,
            rect,
            linePoints: { start, end: clampedPos },
            pageIndex: context.pageIndex,
            id: uuidV4(),
            flags: ['print'],
            created: new Date(),
            type: PdfAnnotationSubtype.LINE,
          });
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
