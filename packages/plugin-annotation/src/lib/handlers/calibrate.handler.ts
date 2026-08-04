import {
  PdfAnnotationBorderStyle,
  PdfAnnotationLineEnding,
  PdfAnnotationSubtype,
  PdfLineAnnoObject,
} from '@embedpdf/models';
import { clamp } from '@embedpdf/core';
import { HandlerFactory, PreviewState } from './types';
import { useState } from '../utils/use-state';
import * as patching from '../patching';
import { snapAngle } from '../geometry';

/**
 * Draw-to-calibrate handler. Drag a line over a feature of known real-world
 * length; on release it reports the two page-space points via `onCalibrate`
 * (it does NOT create an annotation) so the UI can prompt for the real length
 * and derive the measurement scale. Shows a live line + length label while
 * dragging, and supports hold-Shift angle constraint.
 */
export const calibrateHandlerFactory: HandlerFactory<PdfLineAnnoObject> = {
  annotationType: PdfAnnotationSubtype.LINE,
  create(context) {
    const { pageSize, onPreview, onCalibrate, getTool } = context;
    const [getStart, setStart] = useState<{ x: number; y: number } | null>(null);

    const clampToPage = (pos: { x: number; y: number }) => ({
      x: clamp(pos.x, 0, pageSize.width),
      y: clamp(pos.y, 0, pageSize.height),
    });

    const getDefaults = () => {
      const tool = getTool();
      return {
        strokeWidth: tool?.defaults.strokeWidth ?? 2,
        strokeColor: tool?.defaults.strokeColor ?? '#2962FF',
        color: 'transparent',
        opacity: 1,
        strokeStyle: PdfAnnotationBorderStyle.SOLID,
        strokeDashArray: [] as number[],
        lineEndings: {
          start: PdfAnnotationLineEnding.None,
          end: PdfAnnotationLineEnding.None,
        },
        measurement: tool?.defaults.measurement,
      };
    };

    const getPreview = (current: {
      x: number;
      y: number;
    }): PreviewState<PdfAnnotationSubtype.LINE> | null => {
      const start = getStart();
      if (!start) return null;
      const d = getDefaults();
      const bounds = patching.lineRectWithEndings([start, current], d.strokeWidth, d.lineEndings);
      return {
        type: PdfAnnotationSubtype.LINE,
        bounds,
        data: { ...d, rect: bounds, linePoints: { start, end: current } },
      };
    };

    return {
      onPointerDown: (pos, evt) => {
        const p = clampToPage(pos);
        setStart(p);
        onPreview(getPreview(p));
        evt.setPointerCapture?.();
      },
      onPointerMove: (pos, evt) => {
        const start = getStart();
        if (!start) return;
        let p = clampToPage(pos);
        if (evt?.shiftKey) p = clampToPage(snapAngle(start, p));
        onPreview(getPreview(p));
      },
      onPointerUp: (pos, evt) => {
        const start = getStart();
        if (!start) return;
        let p = clampToPage(pos);
        if (evt?.shiftKey) p = clampToPage(snapAngle(start, p));

        setStart(null);
        onPreview(null);
        evt.releasePointerCapture?.();

        // Only report a calibration segment if the user actually drew a line.
        if (Math.abs(p.x - start.x) > 2 || Math.abs(p.y - start.y) > 2) {
          onCalibrate?.(start, p);
        }
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
