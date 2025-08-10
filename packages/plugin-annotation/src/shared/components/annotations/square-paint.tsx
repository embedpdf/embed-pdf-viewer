import { useEffect, useMemo, useState } from '@framework';
import type { PointerEventHandlers } from '@embedpdf/plugin-interaction-manager';
import { usePointerHandlers } from '@embedpdf/plugin-interaction-manager/@framework';
import { ActiveTool } from '@embedpdf/plugin-annotation';
import {
  PdfAnnotationSubtype,
  PdfAnnotationBorderStyle,
  PdfSquareAnnoObject,
  Rect,
  PdfAnnotationFlags,
  uuidV4,
} from '@embedpdf/models';
import { useAnnotationCapability } from '../../hooks';

interface SquarePaintProps {
  pageIndex: number;
  scale: number;
  pageWidth: number;
  pageHeight: number;
  /** Optional preview cursor */
  cursor?: string;
}

export const SquarePaint = ({
  pageIndex,
  scale,
  pageWidth,
  pageHeight,
  cursor,
}: SquarePaintProps) => {
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
    return annotationProvides.onActiveToolChange(setActiveTool);
  }, [annotationProvides]);

  const toolColor = activeTool.defaults?.color ?? '#000000';
  const toolOpacity = activeTool.defaults?.opacity ?? 1;
  const toolStrokeWidth = activeTool.defaults?.strokeWidth ?? 2;
  const toolStrokeColor = activeTool.defaults?.strokeColor ?? '#000000';
  const toolStrokeStyle = activeTool.defaults?.strokeStyle ?? PdfAnnotationBorderStyle.SOLID;
  const toolStrokeDashArray = activeTool.defaults?.strokeDashArray ?? [];

  /* ------------------------------------------------------------------ */
  /* integration with interaction-manager                               */
  /* ------------------------------------------------------------------ */
  const { register } = usePointerHandlers({ modeId: 'square', pageIndex });

  /* ------------------------------------------------------------------ */
  /* helpers                                                            */
  /* ------------------------------------------------------------------ */
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

  /* page size in **PDF-space** (unscaled) ----------------------------- */
  const pageWidthPDF = pageWidth / scale;
  const pageHeightPDF = pageHeight / scale;

  /* ------------------------------------------------------------------ */
  /* local state – anchor/start + current point for preview             */
  /* ------------------------------------------------------------------ */
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [current, setCurrent] = useState<{ x: number; y: number } | null>(null);

  const handlers = useMemo<PointerEventHandlers<PointerEvent>>(
    () => ({
      onPointerDown: (pos, evt) => {
        const x = clamp(pos.x, 0, pageWidthPDF);
        const y = clamp(pos.y, 0, pageHeightPDF);
        setStart({ x, y });
        setCurrent({ x, y });
        (evt.target as HTMLElement)?.setPointerCapture?.(evt.pointerId);
      },
      onPointerMove: (pos) => {
        if (!start) return;
        const x = clamp(pos.x, 0, pageWidthPDF);
        const y = clamp(pos.y, 0, pageHeightPDF);
        setCurrent({ x, y });
      },
      onPointerUp: (_, evt) => {
        if (start && current && annotationProvides) {
          const minX = Math.min(start.x, current.x);
          const minY = Math.min(start.y, current.y);
          const maxX = Math.max(start.x, current.x);
          const maxY = Math.max(start.y, current.y);

          // Ignore very small squares
          if (maxX - minX >= 1 && maxY - minY >= 1) {
            const halfStroke = toolStrokeWidth / 2;
            const rect: Rect = {
              origin: { x: minX - halfStroke, y: minY - halfStroke },
              size: {
                width: maxX - minX + toolStrokeWidth,
                height: maxY - minY + toolStrokeWidth,
              },
            };

            const anno: PdfSquareAnnoObject = {
              type: PdfAnnotationSubtype.SQUARE,
              rect,
              flags: ['print'],
              color: toolColor,
              opacity: toolOpacity,
              strokeWidth: toolStrokeWidth,
              strokeColor: toolStrokeColor,
              strokeStyle: toolStrokeStyle,
              strokeDashArray: toolStrokeDashArray,
              pageIndex,
              id: uuidV4(),
              created: new Date(),
            };

            annotationProvides.createAnnotation(pageIndex, anno);
            annotationProvides.setActiveVariant(null);
            annotationProvides.selectAnnotation(pageIndex, anno.id);
          }
        }
        (evt.target as HTMLElement)?.releasePointerCapture?.(evt.pointerId);
        setStart(null);
        setCurrent(null);
      },
      onPointerCancel: (_, evt) => {
        (evt.target as HTMLElement)?.releasePointerCapture?.(evt.pointerId);
        setStart(null);
        setCurrent(null);
      },
    }),
    [
      start,
      current,
      annotationProvides,
      pageIndex,
      pageWidthPDF,
      pageHeightPDF,
      toolColor,
      toolOpacity,
      toolStrokeWidth,
    ],
  );

  /* register with the interaction-manager */
  useEffect(() => (register ? register(handlers) : undefined), [register, handlers]);

  /* ------------------------------------------------------------------ */
  /* render preview                                                     */
  /* ------------------------------------------------------------------ */
  if (!activeTool.defaults || activeTool.defaults.subtype !== PdfAnnotationSubtype.SQUARE)
    return null;

  if (!start || !current) return null;

  const minX = Math.min(start.x, current.x);
  const minY = Math.min(start.y, current.y);
  const maxX = Math.max(start.x, current.x);
  const maxY = Math.max(start.y, current.y);

  const halfStroke = toolStrokeWidth / 2;
  const svgMinX = minX - halfStroke;
  const svgMinY = minY - halfStroke;
  const width = maxX - minX;
  const height = maxY - minY;
  const dw = width + toolStrokeWidth;
  const dh = height + toolStrokeWidth;

  return (
    <svg
      style={{
        position: 'absolute',
        left: svgMinX * scale,
        top: svgMinY * scale,
        width: dw * scale,
        height: dh * scale,
        pointerEvents: 'none',
        zIndex: 2,
      }}
      width={dw * scale}
      height={dh * scale}
      viewBox={`0 0 ${dw} ${dh}`}
    >
      <rect
        x={halfStroke}
        y={halfStroke}
        width={width}
        height={height}
        fill={toolColor}
        opacity={toolOpacity}
        style={{
          cursor,
          stroke: toolStrokeColor,
          strokeWidth: toolStrokeWidth,
          ...(toolStrokeStyle === PdfAnnotationBorderStyle.DASHED && {
            strokeDasharray: toolStrokeDashArray.join(','),
          }),
        }}
      />
    </svg>
  );
};
