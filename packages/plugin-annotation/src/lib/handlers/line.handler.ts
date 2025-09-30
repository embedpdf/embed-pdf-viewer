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
import { useClickDetector } from './click-detector';

export const lineHandlerFactory: HandlerFactory<PdfLineAnnoObject> = {
  annotationType: PdfAnnotationSubtype.LINE,
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
        flags: tool.defaults.flags ?? ['print'],
      };
    };

    const clickDetector = useClickDetector<PdfLineAnnoObject>({
      threshold: 5,
      getTool,
      onClickDetected: (pos, tool) => {
        const defaults = getDefaults();
        if (!defaults) return;

        const clickConfig = tool.clickBehavior;
        if (!clickConfig?.enabled) return;

        const angle = clickConfig.defaultAngle ?? 0;
        const length = clickConfig.defaultLength;
        const halfLength = length / 2;

        // Calculate start and end points centered at click position
        const startX = pos.x - halfLength * Math.cos(angle);
        const startY = pos.y - halfLength * Math.sin(angle);
        const endX = pos.x + halfLength * Math.cos(angle);
        const endY = pos.y + halfLength * Math.sin(angle);

        // Clamp both points to page bounds
        const start = clampToPage({ x: startX, y: startY });
        const end = clampToPage({ x: endX, y: endY });

        // If clamping significantly altered the line, we might want to maintain the angle
        // by adjusting the opposite point, but for simplicity we'll just use the clamped points

        const rect = patching.lineRectWithEndings(
          [start, end],
          defaults.strokeWidth,
          defaults.lineEndings,
        );

        onCommit({
          ...defaults,
          rect,
          linePoints: { start, end },
          pageIndex,
          id: uuidV4(),
          created: new Date(),
          type: PdfAnnotationSubtype.LINE,
        });
      },
    });

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

        const clampedPos = clampToPage(pos);

        if (!clickDetector.hasMoved()) {
          clickDetector.onEnd(clampedPos);
        } else {
          const defaults = getDefaults();
          if (!defaults) return;

          // Only create if line is long enough
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
              pageIndex,
              id: uuidV4(),
              flags: ['print'],
              created: new Date(),
              type: PdfAnnotationSubtype.LINE,
            });
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
