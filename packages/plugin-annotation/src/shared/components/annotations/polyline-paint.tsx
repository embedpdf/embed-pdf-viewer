import { useEffect, useMemo, useState } from '@framework';
import type { PointerEventHandlers } from '@embedpdf/plugin-interaction-manager';
import { usePointerHandlers } from '@embedpdf/plugin-interaction-manager/@framework';
import { ActiveTool } from '@embedpdf/plugin-annotation';
import {
  PdfAnnotationBorderStyle,
  PdfAnnotationSubtype,
  PdfPolylineAnnoObject,
  uuidV4,
} from '@embedpdf/models';
import { useAnnotationCapability } from '../../hooks';
import { patching } from '@embedpdf/plugin-annotation';
import { Polyline } from './polyline';

interface PolylinePaintProps {
  pageIndex: number;
  scale: number;
  pageWidth: number;
  pageHeight: number;
  /** Optional preview cursor */
  cursor?: string;
}

export const PolylinePaint = ({
  pageIndex,
  scale,
  pageWidth,
  pageHeight,
  cursor,
}: PolylinePaintProps) => {
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
  const toolLineEndings = activeTool.defaults?.lineEndings ?? undefined;
  const toolStrokeStyle = activeTool.defaults?.strokeStyle ?? PdfAnnotationBorderStyle.SOLID;
  const toolStrokeDashArray = activeTool.defaults?.strokeDashArray ?? [];

  /* ------------------------------------------------------------------ */
  /* integration with interaction-manager                               */
  /* ------------------------------------------------------------------ */
  const { register } = usePointerHandlers({ modeId: 'polyline', pageIndex });

  /* ------------------------------------------------------------------ */
  /* helpers                                                            */
  /* ------------------------------------------------------------------ */
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

  /* page size in **PDF-space** (unscaled) ----------------------------- */
  const pageWidthPDF = pageWidth / scale;
  const pageHeightPDF = pageHeight / scale;

  /* ------------------------------------------------------------------ */
  /* local state – vertices & current pointer                           */
  /* ------------------------------------------------------------------ */
  const [vertices, setVertices] = useState<{ x: number; y: number }[]>([]);
  const [current, setCurrent] = useState<{ x: number; y: number } | null>(null);

  /* ------------------------------------------------------------------ */
  /* commit helper                                                      */
  /* ------------------------------------------------------------------ */
  const commitPolyline = (pts: { x: number; y: number }[]) => {
    if (pts.length < 2) return; // need at least a line

    const rect = patching.lineRectWithEndings(pts, toolStrokeWidth, toolLineEndings);

    const anno: PdfPolylineAnnoObject = {
      type: PdfAnnotationSubtype.POLYLINE,
      rect,
      vertices: pts,
      color: toolColor,
      opacity: toolOpacity,
      strokeWidth: toolStrokeWidth,
      strokeColor: toolStrokeColor,
      strokeStyle: toolStrokeStyle,
      strokeDashArray: toolStrokeDashArray,
      lineEndings: toolLineEndings,
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
      onClick: (pos) => {
        const x = clamp(pos.x, 0, pageWidthPDF);
        const y = clamp(pos.y, 0, pageHeightPDF);
        setVertices((prev) => [...prev, { x, y }]);
        setCurrent({ x, y });
      },
      onDoubleClick: () => {
        if (vertices.length >= 1 && annotationProvides) {
          commitPolyline(vertices);
        }
        setVertices([]);
        setCurrent(null);
      },
      onPointerMove: (pos) => {
        if (!vertices.length) return;
        const x = clamp(pos.x, 0, pageWidthPDF);
        const y = clamp(pos.y, 0, pageHeightPDF);
        setCurrent({ x, y });
      },
      onPointerCancel: () => {
        setVertices([]);
        setCurrent(null);
      },
    }),
    [vertices, annotationProvides, pageWidthPDF, pageHeightPDF],
  );

  /* register with the interaction-manager */
  useEffect(() => (register ? register(handlers) : undefined), [register, handlers]);

  /* ------------------------------------------------------------------ */
  /* render preview                                                     */
  /* ------------------------------------------------------------------ */
  if (!activeTool.defaults || activeTool.defaults.subtype !== PdfAnnotationSubtype.POLYLINE)
    return null;

  if (!vertices.length || !current) return null;

  const allPts = [...vertices, current];
  const rect = patching.lineRectWithEndings(allPts, toolStrokeWidth, toolLineEndings);

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
        cursor: cursor,
      }}
    >
      <Polyline
        rect={rect}
        vertices={allPts}
        strokeWidth={toolStrokeWidth}
        scale={scale}
        isSelected={false}
        color={toolColor}
        strokeColor={toolStrokeColor}
        opacity={toolOpacity}
        lineEndings={toolLineEndings}
      />
    </div>
  );
};
