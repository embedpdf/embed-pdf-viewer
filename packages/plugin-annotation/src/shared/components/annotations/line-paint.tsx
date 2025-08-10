import { useEffect, useState, useMemo } from '@framework';
import type { PointerEventHandlers } from '@embedpdf/plugin-interaction-manager';
import { usePointerHandlers } from '@embedpdf/plugin-interaction-manager/@framework';
import { ActiveTool, patching } from '@embedpdf/plugin-annotation';
import {
  PdfAnnotationSubtype,
  PdfLineAnnoObject,
  LineEndings,
  PdfAnnotationBorderStyle,
  uuidV4,
} from '@embedpdf/models';
import { useAnnotationCapability } from '../../hooks';
import { Line } from './line';

interface LinePaintProps {
  pageIndex: number;
  scale: number;
  pageWidth: number;
  pageHeight: number;
  /** Optional preview cursor */
  cursor?: string;
}

export const LinePaint = ({ pageIndex, scale, pageWidth, pageHeight, cursor }: LinePaintProps) => {
  /* ------------------------------------------------------------------ */
  /* annotation capability                                              */
  /* ------------------------------------------------------------------ */
  const { provides: annotationProvides } = useAnnotationCapability();

  /* ------------------------------------------------------------------ */
  /* active tool                                                        */
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
  const toolLineEndings = activeTool.defaults?.lineEndings ?? undefined;
  const intent = activeTool.defaults?.intent ?? undefined;
  /* ------------------------------------------------------------------ */
  /* interaction manager integration                                    */
  /* ------------------------------------------------------------------ */
  const { register } = usePointerHandlers({ modeId: ['line', 'lineArrow'], pageIndex });

  /* ------------------------------------------------------------------ */
  /* helpers                                                            */
  /* ------------------------------------------------------------------ */
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  const pageWidthPDF = pageWidth / scale;
  const pageHeightPDF = pageHeight / scale;

  /* ------------------------------------------------------------------ */
  /* local state                                                        */
  /* ------------------------------------------------------------------ */
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [current, setCurrent] = useState<{ x: number; y: number } | null>(null);

  /* ------------------------------------------------------------------ */
  /* commit helper                                                      */
  /* ------------------------------------------------------------------ */
  const commitLine = (p1: { x: number; y: number }, p2: { x: number; y: number }) => {
    // ignore tiny lines
    if (Math.abs(p2.x - p1.x) < 1 && Math.abs(p2.y - p1.y) < 1) return;

    const rect = patching.lineRectWithEndings([p1, p2], toolStrokeWidth, toolLineEndings);

    const anno: PdfLineAnnoObject = {
      type: PdfAnnotationSubtype.LINE,
      rect,
      linePoints: { start: p1, end: p2 },
      color: toolColor,
      opacity: toolOpacity,
      strokeWidth: toolStrokeWidth,
      strokeColor: toolStrokeColor,
      strokeStyle: toolStrokeStyle,
      strokeDashArray: toolStrokeDashArray,
      lineEndings: toolLineEndings,
      intent,
      pageIndex,
      id: uuidV4(),
      created: new Date(),
    };

    annotationProvides!.createAnnotation(pageIndex, anno);
    annotationProvides!.setActiveVariant(null);
    annotationProvides!.selectAnnotation(pageIndex, anno.id);
  };

  /* ------------------------------------------------------------------ */
  /* pointer handlers                                                   */
  /* ------------------------------------------------------------------ */
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
          commitLine(start, current);
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

  /* register */
  useEffect(() => (register ? register(handlers) : undefined), [register, handlers]);

  /* ------------------------------------------------------------------ */
  /* render preview                                                     */
  /* ------------------------------------------------------------------ */
  if (!activeTool.defaults || activeTool.defaults.subtype !== PdfAnnotationSubtype.LINE)
    return null;

  if (!start || !current) return null;

  const rect = patching.lineRectWithEndings([start, current], toolStrokeWidth, toolLineEndings);

  return (
    <div
      style={{
        position: 'absolute',
        left: rect.origin.x * scale,
        top: rect.origin.y * scale,
        width: rect.size.width * scale,
        height: rect.size.height * scale,
        pointerEvents: 'none',
        zIndex: 2,
        overflow: 'visible',
        cursor,
      }}
    >
      <Line
        rect={rect}
        linePoints={{ start, end: current }}
        strokeWidth={toolStrokeWidth}
        scale={scale}
        isSelected={false}
        color={toolColor}
        strokeColor={toolStrokeColor}
        opacity={toolOpacity}
        lineEndings={toolLineEndings}
        strokeStyle={toolStrokeStyle}
        strokeDashArray={toolStrokeDashArray}
      />
    </div>
  );
};
