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
import { useClickDetector } from './click-detector';
import { getCloudyBorderExtent } from '../geometry';

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
        flags: tool.defaults.flags ?? ['print'],
      };
    };

    const clickDetector = useClickDetector<PdfCircleAnnoObject>({
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

        // Center at click position, but keep within bounds
        const x = clamp(pos.x - halfWidth, 0, pageSize.width - width);
        const y = clamp(pos.y - halfHeight, 0, pageSize.height - height);

        const strokeWidth = defaults.strokeWidth;
        const intensity = defaults.cloudyBorderIntensity ?? 0;
        const pad =
          intensity > 0 ? getCloudyBorderExtent(intensity, strokeWidth, true) : strokeWidth / 2;

        const rect: Rect = {
          origin: { x: x - pad, y: y - pad },
          size: { width: width + 2 * pad, height: height + 2 * pad },
        };

        const anno: PdfCircleAnnoObject = {
          ...defaults,
          type: PdfAnnotationSubtype.CIRCLE,
          created: new Date(),
          id: uuidV4(),
          pageIndex,
          rect,
          ...(intensity > 0 && {
            rectangleDifferences: { left: pad, top: pad, right: pad, bottom: pad },
          }),
        };

        onCommit(anno);
      },
    });

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
      const intensity = defaults.cloudyBorderIntensity ?? 0;
      const pad =
        intensity > 0 ? getCloudyBorderExtent(intensity, strokeWidth, true) : strokeWidth / 2;

      const rect: Rect = {
        origin: { x: minX - pad, y: minY - pad },
        size: { width: width + 2 * pad, height: height + 2 * pad },
      };

      return {
        type: PdfAnnotationSubtype.CIRCLE,
        bounds: rect,
        data: {
          rect,
          ...defaults,
          ...(intensity > 0 && {
            rectangleDifferences: { left: pad, top: pad, right: pad, bottom: pad },
          }),
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
          const defaults = getDefaults();
          if (!defaults) return;

          const preview = getPreview(clampedPos);
          if (preview) {
            const intensity = defaults.cloudyBorderIntensity ?? 0;
            const pad =
              intensity > 0
                ? getCloudyBorderExtent(intensity, defaults.strokeWidth, true)
                : undefined;
            const anno: PdfCircleAnnoObject = {
              ...defaults,
              type: PdfAnnotationSubtype.CIRCLE,
              flags: ['print'],
              created: new Date(),
              id: uuidV4(),
              pageIndex,
              rect: preview.data.rect,
              ...(pad !== undefined && {
                rectangleDifferences: { left: pad, top: pad, right: pad, bottom: pad },
              }),
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
