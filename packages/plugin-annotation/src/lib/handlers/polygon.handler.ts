import {
  PdfAnnotationSubtype,
  PdfPolygonAnnoObject,
  rectFromPoints,
  expandRect,
  uuidV4,
  PdfAnnotationBorderStyle,
  polygonArea,
  polygonPerimeter,
} from '@embedpdf/models';
import { HandlerFactory, PreviewState } from './types';
import { useState } from '../utils/use-state';
import { clamp } from '@embedpdf/core';
import { getCloudyBorderExtent, snapAngle } from '../geometry';

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

      const intensity = defaults.cloudyBorderIntensity ?? 0;
      const pad =
        intensity > 0
          ? getCloudyBorderExtent(intensity, defaults.strokeWidth, false)
          : defaults.strokeWidth / 2;

      const rect = expandRect(rectFromPoints(vertices), pad);
      const anno: PdfPolygonAnnoObject = {
        ...defaults,
        vertices,
        rect,
        type: PdfAnnotationSubtype.POLYGON,
        pageIndex: context.pageIndex,
        id: uuidV4(),
        created: new Date(),
        ...(intensity > 0 && {
          rectangleDifferences: { left: pad, top: pad, right: pad, bottom: pad },
        }),
        ...(defaults.measurement && {
          measurement: {
            ...defaults.measurement,
            computedValue:
              defaults.measurement.mode === 'perimeter'
                ? polygonPerimeter(vertices)
                : polygonArea(vertices),
          },
        }),
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

      const intensity = defaults.cloudyBorderIntensity ?? 0;
      const pad =
        intensity > 0
          ? getCloudyBorderExtent(intensity, defaults.strokeWidth, false)
          : defaults.strokeWidth / 2;

      const allPoints = [...vertices, currentPos];
      const bounds = expandRect(rectFromPoints(allPoints), pad);

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
      onClick: (pos, evt) => {
        if (evt.metaKey || evt.ctrlKey) {
          return;
        }

        let clampedPos = clampToPage(pos);

        if (isInsideStartHandle(clampedPos) && getVertices().length >= 3) {
          commitPolygon();
          return;
        }

        const vertices = getVertices();
        const lastVertex = vertices[vertices.length - 1];

        // Hold Shift to constrain the new edge to 15° angle increments.
        if (evt.shiftKey && lastVertex) clampedPos = clampToPage(snapAngle(lastVertex, clampedPos));

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
      onPointerMove: (pos, evt) => {
        const vertices = getVertices();
        if (vertices.length > 0) {
          let clampedPos = clampToPage(pos);
          const lastVertex = vertices[vertices.length - 1];
          if (evt?.shiftKey && lastVertex) clampedPos = clampToPage(snapAngle(lastVertex, clampedPos));
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
