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

/**
 * Returns true when the given points form a sufficiently straight line.
 * Uses the ratio of max perpendicular deviation to stroke length.
 */
function isLineLike(points: { x: number; y: number }[], threshold: number): boolean {
  if (points.length < 3) return true;
  const A = points[0];
  const B = points[points.length - 1];
  const len = Math.hypot(B.x - A.x, B.y - A.y);
  if (len < 5) return false; // ignore tiny marks
  const maxDev = points.reduce((max, P) => {
    const d = Math.abs((B.x - A.x) * (A.y - P.y) - (A.x - P.x) * (B.y - A.y)) / len;
    return Math.max(max, d);
  }, 0);
  return maxDev / len < threshold;
}

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
        strokeColor: tool.defaults.strokeColor ?? tool.defaults.color ?? '#000000',
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
          blendMode: defaults.blendMode,
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

        // Per-stroke smart line recognition — runs immediately on pointerUp
        const tool = getTool();
        const behavior = tool?.behavior;
        if (behavior?.smartLineRecognition) {
          const threshold = behavior.smartLineThreshold ?? 0.15;
          const strokes = getStrokes();
          const last = strokes[strokes.length - 1];
          if (last && last.points.length > 1 && isLineLike(last.points, threshold)) {
            const first = last.points[0];
            const end = last.points[last.points.length - 1];
            const dx = end.x - first.x;
            const dy = end.y - first.y;
            // Angle from horizontal in degrees (0° = horizontal, 90° = vertical)
            const angleDeg = Math.atan2(Math.abs(dy), Math.abs(dx)) * (180 / Math.PI);
            const snapAngleDeg = behavior.snapAngleDeg ?? 15;

            if (angleDeg <= snapAngleDeg) {
              // Close enough to horizontal — use average Y across all points
              const avgY = last.points.reduce((sum, p) => sum + p.y, 0) / last.points.length;
              last.points = [
                { x: first.x, y: avgY },
                { x: end.x, y: avgY },
              ];
            } else if (angleDeg >= 90 - snapAngleDeg) {
              // Close enough to vertical — use average X across all points
              const avgX = last.points.reduce((sum, p) => sum + p.x, 0) / last.points.length;
              last.points = [
                { x: avgX, y: first.y },
                { x: avgX, y: end.y },
              ];
            }
            // Diagonal straight line — leave the original stroke points intact

            setStrokes([...strokes]);
            onPreview(getPreview());
          }
        }

        const commitDelay = behavior?.commitDelay ?? 800;
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
        }, commitDelay);
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
