import {
  PdfAnnotationSubtype,
  PdfInkAnnoObject,
  rectFromPoints,
  expandRect,
  uuidV4,
} from '@embedpdf/models';
import { HandlerFactory, PreviewState } from './types';
import { useState } from '../utils/use-state';
import { clamp } from '@embedpdf/core';

export const inkHandlerFactory: HandlerFactory<PdfInkAnnoObject> = {
  annotationType: PdfAnnotationSubtype.INK,
  create(context) {
    const { onCommit, onPreview, getTool, pageSize } = context;
    const [getStrokes, setStrokes] = useState<Array<{ points: { x: number; y: number }[] }>>([]);
    const [getIsDrawing, setIsDrawing] = useState(false);
    const timerRef = { current: null as any };

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
        color: tool.defaults.color ?? '#000000',
        opacity: tool.defaults.opacity ?? 1,
        flags: tool.defaults.flags ?? ['print'],
      };
    };

    const getPreview = (): PreviewState<PdfAnnotationSubtype.INK> | null => {
      const strokes = getStrokes();
      if (strokes.length === 0 || strokes[0].points.length === 0) return null;

      const defaults = getDefaults();
      if (!defaults) return null;

      const allPoints = strokes.flatMap((s) => s.points);
      const bounds = expandRect(rectFromPoints(allPoints), defaults.strokeWidth / 2);

      return {
        type: PdfAnnotationSubtype.INK,
        bounds,
        data: {
          ...defaults,
          rect: bounds,
          inkList: strokes,
        },
      };
    };

    return {
      onPointerDown: (pos, evt) => {
        const clampedPos = clampToPage(pos);
        setIsDrawing(true);
        if (timerRef.current) clearTimeout(timerRef.current);

        const newStrokes = [...getStrokes(), { points: [clampedPos] }];
        setStrokes(newStrokes);
        onPreview(getPreview());
        evt.setPointerCapture?.();
      },
      onPointerMove: (pos) => {
        if (!getIsDrawing()) return;
        const strokes = getStrokes();
        if (strokes.length === 0) return;

        const clampedPos = clampToPage(pos);
        strokes[strokes.length - 1].points.push(clampedPos);
        setStrokes(strokes);
        onPreview(getPreview());
      },
      onPointerUp: (_, evt) => {
        setIsDrawing(false);
        evt.releasePointerCapture?.();

        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          const strokes = getStrokes();
          if (strokes.length > 0 && strokes[0].points.length > 1) {
            const defaults = getDefaults();
            if (!defaults) return;

            const allPoints = strokes.flatMap((s) => s.points);
            const rect = expandRect(rectFromPoints(allPoints), defaults.strokeWidth / 2);

            onCommit({
              ...defaults,
              inkList: strokes,
              rect,
              type: PdfAnnotationSubtype.INK,
              pageIndex: context.pageIndex,
              id: uuidV4(),
              created: new Date(),
            });
          }
          setStrokes([]);
          onPreview(null);
        }, 800); // Commit after 800ms of inactivity
      },
      onPointerCancel: (_, evt) => {
        setStrokes([]);
        setIsDrawing(false);
        onPreview(null);
        if (timerRef.current) clearTimeout(timerRef.current);
        evt.releasePointerCapture?.();
      },
    };
  },
};
