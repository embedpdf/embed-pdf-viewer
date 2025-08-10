import { useEffect, useMemo, useState } from '@framework';
import type { PointerEventHandlers } from '@embedpdf/plugin-interaction-manager';
import { usePointerHandlers } from '@embedpdf/plugin-interaction-manager/@framework';
import { ActiveTool } from '@embedpdf/plugin-annotation';
import {
  PdfAnnotationBorderStyle,
  PdfAnnotationSubtype,
  PdfPolygonAnnoObject,
  Rect,
  uuidV4,
} from '@embedpdf/models';
import { useAnnotationCapability } from '../../hooks';

interface PolygonPaintProps {
  pageIndex: number;
  scale: number;
  pageWidth: number;
  pageHeight: number;
  cursor?: string;
}

const HANDLE_SIZE_PX = 14; // visual square size on screen

export const PolygonPaint = ({
  pageIndex,
  scale,
  pageWidth,
  pageHeight,
  cursor,
}: PolygonPaintProps) => {
  const { provides: annotationProvides } = useAnnotationCapability();

  const [activeTool, setActiveTool] = useState<ActiveTool>({ variantKey: null, defaults: null });
  useEffect(() => annotationProvides?.onActiveToolChange(setActiveTool), [annotationProvides]);

  const toolColor = activeTool.defaults?.color ?? '#000000';
  const toolOpacity = activeTool.defaults?.opacity ?? 1;
  const toolStrokeWidth = activeTool.defaults?.strokeWidth ?? 2;
  const toolStrokeColor = activeTool.defaults?.strokeColor ?? '#000000';
  const toolStrokeStyle = activeTool.defaults?.strokeStyle ?? PdfAnnotationBorderStyle.SOLID;
  const toolStrokeDashArray = activeTool.defaults?.strokeDashArray ?? [];

  const { register } = usePointerHandlers({ modeId: 'polygon', pageIndex });

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  const pageWidthPDF = pageWidth / scale;
  const pageHeightPDF = pageHeight / scale;

  const [vertices, setVertices] = useState<{ x: number; y: number }[]>([]);
  const [current, setCurrent] = useState<{ x: number; y: number } | null>(null);

  const commitPolygon = (pts: { x: number; y: number }[]) => {
    const xs = pts.map((p) => p.x),
      ys = pts.map((p) => p.y);
    const minX = Math.min(...xs),
      minY = Math.min(...ys);
    const maxX = Math.max(...xs),
      maxY = Math.max(...ys);
    if (maxX - minX < 1 || maxY - minY < 1) return;

    const half = toolStrokeWidth / 2;
    const rect: Rect = {
      origin: { x: minX - half, y: minY - half },
      size: { width: maxX - minX + toolStrokeWidth, height: maxY - minY + toolStrokeWidth },
    };

    const anno: PdfPolygonAnnoObject = {
      type: PdfAnnotationSubtype.POLYGON,
      rect,
      vertices: pts,
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

    annotationProvides!.createAnnotation(pageIndex, anno);
    annotationProvides!.setActiveVariant(null);
    annotationProvides!.selectAnnotation(pageIndex, anno.id);
  };

  // Square hit-test in PDF units
  const isInsideStartHandle = (x: number, y: number) => {
    if (vertices.length < 2) return false;
    const sizePDF = HANDLE_SIZE_PX / scale;
    const half = sizePDF / 2;
    const v0 = vertices[0];
    return x >= v0.x - half && x <= v0.x + half && y >= v0.y - half && y <= v0.y + half;
  };

  const handlers = useMemo<PointerEventHandlers<PointerEvent>>(
    () => ({
      onClick: (pos) => {
        const x = clamp(pos.x, 0, pageWidthPDF);
        const y = clamp(pos.y, 0, pageHeightPDF);

        // Click on start-handle ⇒ close polygon
        if (isInsideStartHandle(x, y) && vertices.length >= 3 && annotationProvides) {
          commitPolygon(vertices);
          setVertices([]);
          setCurrent(null);
          return;
        }

        // Normal vertex add
        setVertices((prev) => [...prev, { x, y }]);
        setCurrent({ x, y });
      },
      onDoubleClick: () => {
        if (vertices.length >= 3 && annotationProvides) {
          commitPolygon(vertices);
          setVertices([]);
          setCurrent(null);
        } else {
          setVertices([]);
          setCurrent(null);
        }
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
    [vertices, current, annotationProvides, pageWidthPDF, pageHeightPDF],
  );

  useEffect(() => (register ? register(handlers) : undefined), [register, handlers]);

  // ---------- preview ----------
  const allPts = [...vertices];
  if (current) allPts.push(current);
  const xs = allPts.map((p) => p.x),
    ys = allPts.map((p) => p.y);
  const minX = Math.min(...xs),
    minY = Math.min(...ys);
  const maxX = Math.max(...xs),
    maxY = Math.max(...ys);

  const half = toolStrokeWidth / 2;
  const svgMinX = minX - half;
  const svgMinY = minY - half;
  const svgMaxX = maxX + half;
  const svgMaxY = maxY + half;
  const dw = svgMaxX - svgMinX;
  const dh = svgMaxY - svgMinY;

  const mainPath = useMemo(() => {
    let d = '';
    allPts.forEach(({ x, y }, i) => {
      d += (i === 0 ? 'M' : 'L') + (x - svgMinX) + ' ' + (y - svgMinY) + ' ';
    });
    return d.trim();
  }, [allPts, svgMinX, svgMinY]);

  if (!activeTool.defaults || activeTool.defaults.subtype !== PdfAnnotationSubtype.POLYGON)
    return null;

  if (!vertices.length || !current) return null;

  const dottedPath =
    vertices.length >= 2
      ? (() => {
          const curLx = current.x - svgMinX;
          const curLy = current.y - svgMinY;
          const firstLx = vertices[0].x - svgMinX;
          const firstLy = vertices[0].y - svgMinY;
          return `M ${curLx} ${curLy} L ${firstLx} ${firstLy}`;
        })()
      : null;

  // Start-handle rect (screen px converted to pdf units, then to local svg coords)
  const handleSizePDF = HANDLE_SIZE_PX / scale;
  const hHalf = handleSizePDF / 2;
  const hx = vertices[0].x - hHalf - svgMinX;
  const hy = vertices[0].y - hHalf - svgMinY;

  return (
    <svg
      style={{
        position: 'absolute',
        left: svgMinX * scale,
        top: svgMinY * scale,
        width: dw * scale,
        height: dh * scale,
        pointerEvents: 'none', // we handle clicks at the page layer
        zIndex: 2,
        overflow: 'visible',
      }}
      width={dw * scale}
      height={dh * scale}
      viewBox={`0 0 ${dw} ${dh}`}
    >
      {/* solid preview edges */}
      <path
        d={mainPath}
        fill={toolColor}
        opacity={toolOpacity}
        style={{
          cursor,
          stroke: toolStrokeColor,
          strokeWidth: toolStrokeWidth,
          ...(toolStrokeStyle === PdfAnnotationBorderStyle.DASHED && {
            strokeDasharray: toolStrokeDashArray?.join(','),
          }),
        }}
      />

      {/* dotted closing helper */}
      {dottedPath && (
        <path
          d={dottedPath}
          fill="none"
          style={{ stroke: toolStrokeColor, strokeWidth: toolStrokeWidth, strokeDasharray: '4,4' }}
        />
      )}

      {/* clickable start-handle (visual only; hit-test done in handler) */}
      {vertices.length >= 3 && (
        <rect
          x={hx}
          y={hy}
          width={handleSizePDF}
          height={handleSizePDF}
          fill={toolStrokeColor}
          opacity={0.4}
          stroke={toolStrokeColor}
          strokeWidth={toolStrokeWidth / 2}
          style={{ pointerEvents: 'none' }}
        />
      )}
    </svg>
  );
};
