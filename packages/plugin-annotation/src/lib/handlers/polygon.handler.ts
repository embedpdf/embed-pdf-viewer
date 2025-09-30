import {
  PdfAnnotationSubtype,
  PdfPolygonAnnoObject,
  rectFromPoints,
  expandRect,
  uuidV4,
  PdfAnnotationBorderStyle,
} from '@embedpdf/models';
import { HandlerFactory, PreviewState } from './types';
import { useState } from '../utils/use-state';
import { clamp } from '@embedpdf/core';

const HANDLE_SIZE_PX = 14;

export const polygonHandlerFactory: HandlerFactory<PdfPolygonAnnoObject> = {
  annotationType: PdfAnnotationSubtype.POLYGON,
  create(context) {
    const { onCommit, onPreview, getTool, scale, pageSize } = context;

    const [getVertices, setVertices] = useState<{ x: number; y: number }[]>([]);
    const [getCurrent, setCurrent] = useState<{ x: number; y: number } | null>(null);

    const clampToPage = (pos: { x: number; y: number }) => ({
      x: clamp(pos.x, 0, pageSize.width),
      y: clamp(pos.y, 0, pageSize.height),
    });

    const isInsideStartHandle = (pos: { x: number; y: number }) => {
      const vertices = getVertices();
      if (vertices.length < 2) return false;
      const sizePDF = HANDLE_SIZE_PX / scale;
      const half = sizePDF / 2;
      const v0 = vertices[0];
      return (
        pos.x >= v0.x - half && pos.x <= v0.x + half && pos.y >= v0.y - half && pos.y <= v0.y + half
      );
    };

    const getDefaults = () => {
      const tool = getTool();
      if (!tool) return null;
      return {
        ...tool.defaults,
        color: tool.defaults.color ?? '#000000',
        opacity: tool.defaults.opacity ?? 1,
        strokeWidth: tool.defaults.strokeWidth ?? 1,
        strokeColor: tool.defaults.strokeColor ?? '#000000',
        strokeStyle: tool.defaults.strokeStyle ?? PdfAnnotationBorderStyle.SOLID,
        strokeDashArray: tool.defaults.strokeDashArray ?? [],
        flags: tool.defaults.flags ?? ['print'],
      };
    };

    const commitPolygon = () => {
      const vertices = getVertices();
      if (vertices.length < 3) return;
      const defaults = getDefaults();
      if (!defaults) return;

      const rect = expandRect(rectFromPoints(vertices), defaults.strokeWidth / 2);
      const anno: PdfPolygonAnnoObject = {
        ...defaults,
        vertices,
        rect,
        type: PdfAnnotationSubtype.POLYGON,
        pageIndex: context.pageIndex,
        id: uuidV4(),
        created: new Date(),
      };
      onCommit(anno);

      setVertices([]);
      setCurrent(null);
      onPreview(null);
    };

    const getPreview = (): PreviewState<PdfAnnotationSubtype.POLYGON> | null => {
      const vertices = getVertices();
      const currentPos = getCurrent();
      if (vertices.length === 0 || !currentPos) return null;

      const defaults = getDefaults();
      if (!defaults) return null;

      const allPoints = [...vertices, currentPos];
      const bounds = expandRect(rectFromPoints(allPoints), defaults.strokeWidth / 2);

      return {
        type: PdfAnnotationSubtype.POLYGON,
        bounds,
        data: {
          ...defaults,
          rect: bounds,
          vertices: vertices,
          currentVertex: currentPos,
        },
      };
    };

    return {
      onClick: (pos) => {
        const clampedPos = clampToPage(pos);

        if (isInsideStartHandle(clampedPos) && getVertices().length >= 3) {
          commitPolygon();
          return;
        }

        const vertices = getVertices();
        const lastVertex = vertices[vertices.length - 1];

        // Don't add duplicate points (prevents double-click issue)
        if (
          lastVertex &&
          Math.abs(lastVertex.x - clampedPos.x) < 1 &&
          Math.abs(lastVertex.y - clampedPos.y) < 1
        ) {
          return;
        }

        setVertices([...vertices, clampedPos]);
        setCurrent(clampedPos);
        onPreview(getPreview());
      },
      onDoubleClick: (_) => {
        commitPolygon();
      },
      onPointerMove: (pos) => {
        if (getVertices().length > 0) {
          const clampedPos = clampToPage(pos);
          setCurrent(clampedPos);
          onPreview(getPreview());
        }
      },
      onPointerCancel: (_) => {
        setVertices([]);
        setCurrent(null);
        onPreview(null);
      },
    };
  },
};
