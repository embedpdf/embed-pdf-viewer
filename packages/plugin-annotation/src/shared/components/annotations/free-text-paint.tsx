// packages/plugin-annotation/src/shared/components/annotations/free-text-paint.tsx
import { useEffect, useMemo, useState } from '@framework';
import type { PointerEventHandlers } from '@embedpdf/plugin-interaction-manager';
import { usePointerHandlers } from '@embedpdf/plugin-interaction-manager/@framework';
import { ActiveTool } from '@embedpdf/plugin-annotation';
import {
  PdfAnnotationSubtype,
  PdfFreeTextAnnoObject,
  PdfStandardFont,
  PdfTextAlignment,
  PdfVerticalAlignment,
  Rect,
  uuidV4,
} from '@embedpdf/models';
import { useAnnotationCapability, useAnnotationPlugin } from '../../hooks';

interface FreeTextPaintProps {
  pageIndex: number;
  scale: number;
  pageWidth: number;
  pageHeight: number;
  /** Optional preview cursor */
  cursor?: string;
}

export const FreeTextPaint = ({
  pageIndex,
  scale,
  pageWidth,
  pageHeight,
  cursor = 'text',
}: FreeTextPaintProps) => {
  /* ------------------------------------------------------------------ */
  /* annotation capability                                              */
  /* ------------------------------------------------------------------ */
  const { provides: annotationProvides } = useAnnotationCapability();
  /* ------------------------------------------------------------------ */
  /* active tool                                                        */
  /* ------------------------------------------------------------------ */
  const [activeTool, setActiveTool] = useState<ActiveTool>({ variantKey: null, defaults: null });
  useEffect(() => annotationProvides?.onActiveToolChange(setActiveTool), [annotationProvides]);

  const toolFontColor = activeTool.defaults?.fontColor ?? '#000000';
  const toolOpacity = activeTool.defaults?.opacity ?? 1;
  const toolFontSize = activeTool.defaults?.fontSize ?? 12;
  const toolFontFamily = activeTool.defaults?.fontFamily ?? PdfStandardFont.Unknown;
  const toolBackgroundColor = activeTool.defaults?.backgroundColor ?? 'transparent';
  const toolTextAlign = activeTool.defaults?.textAlign ?? PdfTextAlignment.Left;
  const toolVerticalAlign = activeTool.defaults?.verticalAlign ?? PdfVerticalAlignment.Top;
  const toolContent = activeTool.defaults?.content ?? 'Insert text here';

  /* ------------------------------------------------------------------ */
  /* interaction-manager integration                                    */
  /* ------------------------------------------------------------------ */
  const { register } = usePointerHandlers({ modeId: 'freeText', pageIndex });

  /* helpers ----------------------------------------------------------- */
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  const pageWidthPDF = pageWidth / scale;
  const pageHeightPDF = pageHeight / scale;

  /* local drag state -------------------------------------------------- */
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [current, setCurrent] = useState<{ x: number; y: number } | null>(null);

  /* commit helper ----------------------------------------------------- */
  const commitFreeText = (p1: { x: number; y: number }, p2: { x: number; y: number }) => {
    const minX = Math.min(p1.x, p2.x);
    const minY = Math.min(p1.y, p2.y);
    const maxX = Math.max(p1.x, p2.x);
    const maxY = Math.max(p1.y, p2.y);
    const w = maxX - minX;
    const h = maxY - minY;

    if (w < 1 || h < 1) return; // ignore tiny boxes

    const rect: Rect = {
      origin: { x: minX, y: minY },
      size: { width: w, height: h },
    };

    const anno: PdfFreeTextAnnoObject = {
      type: PdfAnnotationSubtype.FREETEXT,
      rect,
      contents: toolContent,
      fontColor: toolFontColor,
      fontSize: toolFontSize,
      fontFamily: toolFontFamily,
      opacity: toolOpacity,
      backgroundColor: toolBackgroundColor,
      textAlign: toolTextAlign,
      verticalAlign: toolVerticalAlign,
      pageIndex,
      id: uuidV4(),
      created: new Date(),
    };

    annotationProvides!.createAnnotation(pageIndex, anno);
    annotationProvides!.setActiveVariant(null);
    annotationProvides!.selectAnnotation(pageIndex, anno.id);
  };

  /* pointer handlers -------------------------------------------------- */
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
          commitFreeText(start, current);
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
    [start, current, annotationProvides, pageWidthPDF, pageHeightPDF],
  );

  /* register with interaction-manager */
  useEffect(() => (register ? register(handlers) : undefined), [register, handlers]);

  /* ------------------------------------------------------------------ */
  /* render preview while dragging                                      */
  /* ------------------------------------------------------------------ */
  if (!activeTool.defaults || activeTool.defaults.subtype !== PdfAnnotationSubtype.FREETEXT)
    return null;

  if (!start || !current) return null;

  const minX = Math.min(start.x, current.x);
  const minY = Math.min(start.y, current.y);
  const maxX = Math.max(start.x, current.x);
  const maxY = Math.max(start.y, current.y);

  const dw = maxX - minX;
  const dh = maxY - minY;

  return (
    <svg
      style={{
        position: 'absolute',
        left: minX * scale,
        top: minY * scale,
        width: dw * scale,
        height: dh * scale,
        pointerEvents: 'none',
        zIndex: 2,
      }}
      width={dw * scale}
      height={dh * scale}
      viewBox={`0 0 ${dw} ${dh}`}
    >
      {/* Simple outline preview */}
      <rect
        x={0}
        y={0}
        width={dw}
        height={dh}
        fill="transparent"
        style={{
          stroke: toolFontColor,
          strokeWidth: 1,
          strokeDasharray: '4,4',
          cursor,
        }}
      />
    </svg>
  );
};
