import { clamp } from '@embedpdf/core';
import {
  PdfAnnotationBorderStyle,
  PdfAnnotationLineEnding,
  PdfAnnotationSubtype,
  PdfPolylineAnnoObject,
  uuidV4,
} from '@embedpdf/models';
import { HandlerFactory, PreviewState } from './types';
import { useState } from '../utils/use-state';
import * as patching from '../patching';

export const polylineHandlerFactory: HandlerFactory<PdfPolylineAnnoObject> = {
  annotationType: PdfAnnotationSubtype.POLYLINE,
  create(context) {
    const { onCommit, onPreview, getTool, pageSize } = context;

    const [getVertices, setVertices] = useState<{ x: number; y: number }[]>([]);
    const [getCurrent, setCurrent] = useState<{ x: number; y: number } | null>(null);

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
        lineEndings: tool.defaults.lineEndings ?? {
          start: PdfAnnotationLineEnding.None,
          end: PdfAnnotationLineEnding.None,
        },
        color: tool.defaults.color ?? '#000000',
        opacity: tool.defaults.opacity ?? 1,
        strokeColor: tool.defaults.strokeColor ?? '#000000',
        strokeStyle: tool.defaults.strokeStyle ?? PdfAnnotationBorderStyle.SOLID,
        strokeDashArray: tool.defaults.strokeDashArray ?? [],
        flags: tool.defaults.flags ?? ['print'],
      };
    };

    const commitPolyline = () => {
      const vertices = getVertices();
      if (vertices.length < 2) return; // A polyline needs at least two points.

      const defaults = getDefaults();
      if (!defaults) return;

      const rect = patching.lineRectWithEndings(
        vertices,
        defaults.strokeWidth,
        defaults.lineEndings,
      );
      const anno: PdfPolylineAnnoObject = {
        ...defaults,
        vertices,
        rect,
        type: PdfAnnotationSubtype.POLYLINE,
        pageIndex: context.pageIndex,
        id: uuidV4(),
        created: new Date(),
      };
      onCommit(anno);

      setVertices([]);
      setCurrent(null);
      onPreview(null);
    };

    const getPreview = (): PreviewState<PdfAnnotationSubtype.POLYLINE> | null => {
      const vertices = getVertices();
      const currentPos = getCurrent();
      if (vertices.length === 0 || !currentPos) return null;

      const defaults = getDefaults();
      if (!defaults) return null;

      const allPoints = [...vertices, currentPos];
      const bounds = patching.lineRectWithEndings(
        allPoints,
        defaults.strokeWidth,
        defaults.lineEndings,
      );

      return {
        type: PdfAnnotationSubtype.POLYLINE,
        bounds,
        data: {
          ...defaults,
          rect: bounds,
          vertices: allPoints,
          currentVertex: currentPos,
        },
      };
    };

    return {
      onClick: (pos) => {
        const clampedPos = clampToPage(pos);
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
      onDoubleClick: () => {
        commitPolyline();
      },
      onPointerMove: (pos) => {
        if (getVertices().length > 0) {
          const clampedPos = clampToPage(pos);
          setCurrent(clampedPos);
          onPreview(getPreview());
        }
      },
      onPointerCancel: () => {
        setVertices([]);
        setCurrent(null);
        onPreview(null);
      },
    };
  },
};
