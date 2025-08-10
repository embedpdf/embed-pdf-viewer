import { useEffect, useMemo, useRef, useState, JSX } from '@framework';
import type { PointerEventHandlers } from '@embedpdf/plugin-interaction-manager';
import { usePointerHandlers } from '@embedpdf/plugin-interaction-manager/@framework';
import { ActiveTool } from '@embedpdf/plugin-annotation';
import {
  PdfInkListObject,
  Rect,
  PdfAnnotationSubtype,
  PdfInkAnnoObject,
  PdfBlendMode,
  rectFromPoints,
  expandRect,
  uuidV4,
} from '@embedpdf/models';
import { useAnnotationCapability, useAnnotationPlugin } from '../../hooks';

interface InkPaintProps {
  /** Index of the page this layer lives on */
  pageIndex: number;
  /** Scale of the page */
  scale: number;
  /** Width of the page */
  pageWidth: number;
  /** Height of the page */
  pageHeight: number;
}

/**
 * Allows the user to draw freehand ink annotations.
 * Hook it into the interaction-manager with modeId = 'inkPaint'.
 * Supports multi-stroke annotations: if the user starts a new stroke within 3 seconds of releasing the previous one, it adds to the same annotation.
 */
export const InkPaint = ({ pageIndex, scale, pageWidth, pageHeight }: InkPaintProps) => {
  /* ------------------------------------------------------------------ */
  /* annotation capability                                              */
  /* ------------------------------------------------------------------ */
  const { provides: annotationProvides } = useAnnotationCapability();
  /* ------------------------------------------------------------------ */
  /* active tool state                                                  */
  /* ------------------------------------------------------------------ */
  const [activeTool, setActiveTool] = useState<ActiveTool>({ variantKey: null, defaults: null });

  useEffect(() => {
    if (!annotationProvides) return;

    const off = annotationProvides.onActiveToolChange(setActiveTool);
    return off;
  }, [annotationProvides]);

  const toolColor = activeTool.defaults?.color ?? '#000000';
  const toolOpacity = activeTool.defaults?.opacity ?? 1;
  const toolStrokeWidth = activeTool.defaults?.strokeWidth ?? 2;
  const toolBlendMode = activeTool.defaults?.blendMode ?? PdfBlendMode.Normal;
  const intent = activeTool.defaults?.intent ?? undefined;
  /* ------------------------------------------------------------------ */
  /* integration with interaction-manager                               */
  /* ------------------------------------------------------------------ */
  const { register } = usePointerHandlers({ modeId: 'ink', pageIndex });

  /* ------------------------------------------------------------------ */
  /* helpers                                                            */
  /* ------------------------------------------------------------------ */
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

  /* ------------------------------------------------------------------ */
  /* local state – current strokes (preview), persist timer, and drawing flag */
  /* ------------------------------------------------------------------ */
  const [currentStrokes, setCurrentStrokes] = useState<PdfInkListObject[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  /* page size in **PDF-space** (unscaled) ----------------------------- */
  const pageWidthPDF = pageWidth / scale;
  const pageHeightPDF = pageHeight / scale;

  /* ------------------------------------------------------------------ */
  /* pointer handlers                                                   */
  /* ------------------------------------------------------------------ */
  const handlers = useMemo<PointerEventHandlers<PointerEvent>>(
    () => ({
      onPointerDown: (pos, evt) => {
        const curX = clamp(pos.x, 0, pageWidthPDF);
        const curY = clamp(pos.y, 0, pageHeightPDF);

        setIsDrawing(true);

        if (timerRef.current) {
          // Continuing the current annotation – clear timer and add new stroke
          clearTimeout(timerRef.current);
          timerRef.current = null;
          setCurrentStrokes((prev) => [...prev, { points: [{ x: curX, y: curY }] }]);
        } else {
          // Start a new annotation
          setCurrentStrokes([{ points: [{ x: curX, y: curY }] }]);
        }

        (evt.target as HTMLElement)?.setPointerCapture?.(evt.pointerId);
      },
      onPointerMove: (pos) => {
        if (!isDrawing) return;

        const curX = clamp(pos.x, 0, pageWidthPDF);
        const curY = clamp(pos.y, 0, pageHeightPDF);

        // Add point to the last stroke
        setCurrentStrokes((prev) => {
          if (!prev.length) return prev;
          const last = prev[prev.length - 1];
          const newLast = { points: [...last.points, { x: curX, y: curY }] };
          return [...prev.slice(0, -1), newLast];
        });
      },
      onPointerUp: (_, evt) => {
        setIsDrawing(false);
        (evt.target as HTMLElement)?.releasePointerCapture?.(evt.pointerId);

        // Start/restart the persist timer
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          if (currentStrokes.length && annotationProvides) {
            const allPoints = currentStrokes.flatMap((s) => s.points);
            if (!allPoints.length) return;

            const rect = expandRect(rectFromPoints(allPoints), toolStrokeWidth / 2);

            // Ignore tiny drawings
            if (rect.size.width < 1 || rect.size.height < 1) return;

            const anno: PdfInkAnnoObject = {
              type: PdfAnnotationSubtype.INK,
              intent,
              blendMode: toolBlendMode,
              rect,
              inkList: currentStrokes,
              color: toolColor,
              opacity: toolOpacity,
              strokeWidth: toolStrokeWidth,
              created: new Date(),
              pageIndex,
              id: uuidV4(),
            };

            annotationProvides.createAnnotation(pageIndex, anno);
            annotationProvides.setActiveVariant(null);
            annotationProvides.selectAnnotation(pageIndex, anno.id);
          }

          setCurrentStrokes([]);
          timerRef.current = null;
        }, 3000);
      },
      onPointerCancel: (_, evt) => {
        setIsDrawing(false);
        (evt.target as HTMLElement)?.releasePointerCapture?.(evt.pointerId);

        // Cancel – clear preview without persisting
        setCurrentStrokes([]);
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      },
    }),
    [
      pageWidthPDF,
      pageHeightPDF,
      currentStrokes,
      annotationProvides,
      pageIndex,
      toolColor,
      toolOpacity,
      toolStrokeWidth,
      isDrawing,
    ],
  );

  /* register with the interaction-manager */
  useEffect(() => {
    if (!register) return;
    return register(handlers);
  }, [register, handlers]);

  /* cleanup timer on unmount */
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  /* ------------------------------------------------------------------ */
  /* render preview                                                     */
  /* ------------------------------------------------------------------ */
  if (!activeTool.defaults || activeTool.defaults.subtype !== PdfAnnotationSubtype.INK) return null;

  if (!currentStrokes.length) return null;

  const allPoints = currentStrokes.flatMap((s) => s.points);
  if (!allPoints.length) return null;

  const rect = expandRect(rectFromPoints(allPoints), toolStrokeWidth / 2);

  const paths = currentStrokes.map(({ points }) => {
    let d = '';
    points.forEach(({ x, y }, i) => {
      // Adjust coordinates relative to the expanded SVG bounds
      const lx = x - rect.origin.x;
      const ly = y - rect.origin.y;
      d += (i === 0 ? 'M' : 'L') + lx + ' ' + ly + ' ';
    });
    return d.trim();
  });

  return (
    <svg
      style={{
        position: 'absolute',
        left: rect.origin.x * scale,
        top: rect.origin.y * scale,
        width: rect.size.width * scale,
        height: rect.size.height * scale,
        pointerEvents: 'none',
        zIndex: 2,
      }}
      width={rect.size.width * scale}
      height={rect.size.height * scale}
      viewBox={`0 0 ${rect.size.width} ${rect.size.height}`}
    >
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          opacity={toolOpacity}
          style={{
            stroke: toolColor,
            strokeWidth: toolStrokeWidth,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
          }}
        />
      ))}
    </svg>
  );
};
