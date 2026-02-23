import {
  PdfAnnotationSubtype,
  PdfAnnotationObject,
  PdfBlendMode,
  PdfInkAnnoObject,
  PdfSquareAnnoObject,
  PdfCircleAnnoObject,
  PdfLineAnnoObject,
  PdfPolylineAnnoObject,
  PdfPolygonAnnoObject,
  PdfFreeTextAnnoObject,
  PdfStampAnnoObject,
  PdfLinkAnnoObject,
  PdfHighlightAnnoObject,
  PdfUnderlineAnnoObject,
  PdfStrikeOutAnnoObject,
  PdfSquigglyAnnoObject,
  blendModeToCss,
} from '@embedpdf/models';
import { Fragment } from '@framework';
import { BoxedAnnotationRenderer, createRenderer } from './types';
import { Ink } from './annotations/ink';
import { Square } from './annotations/square';
import { Circle } from './annotations/circle';
import { Line } from './annotations/line';
import { Polyline } from './annotations/polyline';
import { Polygon } from './annotations/polygon';
import { FreeText } from './annotations/free-text';
import { Stamp } from './annotations/stamp';
import { Link } from './annotations/link';
import { Highlight } from './text-markup/highlight';
import { Underline } from './text-markup/underline';
import { Strikeout } from './text-markup/strikeout';
import { Squiggly } from './text-markup/squiggly';

export const builtInRenderers: BoxedAnnotationRenderer[] = [
  // --- Drawing ---

  createRenderer<PdfInkAnnoObject>({
    id: 'ink',
    matches: (a): a is PdfInkAnnoObject => a.type === PdfAnnotationSubtype.INK,
    render: ({ currentObject, isSelected, scale, onClick, appearanceActive }) => (
      <Ink
        {...currentObject}
        isSelected={isSelected}
        scale={scale}
        onClick={onClick}
        appearanceActive={appearanceActive}
      />
    ),
    interactionDefaults: { isDraggable: true, isResizable: true, isRotatable: true },
  }),

  // --- Shapes ---

  createRenderer<PdfSquareAnnoObject>({
    id: 'square',
    matches: (a): a is PdfSquareAnnoObject => a.type === PdfAnnotationSubtype.SQUARE,
    render: ({ currentObject, isSelected, scale, onClick, appearanceActive }) => (
      <Square
        {...currentObject}
        isSelected={isSelected}
        scale={scale}
        onClick={onClick}
        appearanceActive={appearanceActive}
      />
    ),
    interactionDefaults: { isDraggable: true, isResizable: true, isRotatable: true },
  }),

  createRenderer<PdfCircleAnnoObject>({
    id: 'circle',
    matches: (a): a is PdfCircleAnnoObject => a.type === PdfAnnotationSubtype.CIRCLE,
    render: ({ currentObject, isSelected, scale, onClick, appearanceActive }) => (
      <Circle
        {...currentObject}
        isSelected={isSelected}
        scale={scale}
        onClick={onClick}
        appearanceActive={appearanceActive}
      />
    ),
    interactionDefaults: { isDraggable: true, isResizable: true, isRotatable: true },
  }),

  // --- Lines & Vertex-based ---

  createRenderer<PdfLineAnnoObject>({
    id: 'line',
    matches: (a): a is PdfLineAnnoObject => a.type === PdfAnnotationSubtype.LINE,
    render: ({ currentObject, isSelected, scale, onClick, appearanceActive }) => (
      <Fragment>
        <Line
          {...currentObject}
          isSelected={isSelected}
          scale={scale}
          onClick={onClick}
          appearanceActive={appearanceActive}
        />
      </Fragment>
    ),
    vertexConfig: {
      extractVertices: (a) => [a.linePoints.start, a.linePoints.end],
      transformAnnotation: (a, v) => ({
        ...a,
        linePoints: { start: v[0], end: v[1] },
      }),
    },
    interactionDefaults: { isDraggable: true, isResizable: false, isRotatable: true },
  }),

  createRenderer<PdfPolylineAnnoObject>({
    id: 'polyline',
    matches: (a): a is PdfPolylineAnnoObject => a.type === PdfAnnotationSubtype.POLYLINE,
    render: ({ currentObject, isSelected, scale, onClick, appearanceActive }) => (
      <Fragment>
        <Polyline
          {...currentObject}
          isSelected={isSelected}
          scale={scale}
          onClick={onClick}
          appearanceActive={appearanceActive}
        />
      </Fragment>
    ),
    vertexConfig: {
      extractVertices: (a) => a.vertices,
      transformAnnotation: (a, vertices) => ({ ...a, vertices }),
    },
    interactionDefaults: { isDraggable: true, isResizable: false, isRotatable: true },
  }),

  createRenderer<PdfPolygonAnnoObject>({
    id: 'polygon',
    matches: (a): a is PdfPolygonAnnoObject => a.type === PdfAnnotationSubtype.POLYGON,
    render: ({ currentObject, isSelected, scale, onClick, appearanceActive }) => (
      <Fragment>
        <Polygon
          {...currentObject}
          isSelected={isSelected}
          scale={scale}
          onClick={onClick}
          appearanceActive={appearanceActive}
        />
      </Fragment>
    ),
    vertexConfig: {
      extractVertices: (a) => a.vertices,
      transformAnnotation: (a, vertices) => ({ ...a, vertices }),
    },
    interactionDefaults: { isDraggable: true, isResizable: false, isRotatable: true },
  }),

  // --- Text Markup ---

  createRenderer<PdfHighlightAnnoObject>({
    id: 'highlight',
    matches: (a): a is PdfHighlightAnnoObject => a.type === PdfAnnotationSubtype.HIGHLIGHT,
    render: ({ currentObject, scale, onClick }) => (
      <Highlight {...currentObject} scale={scale} onClick={onClick} />
    ),
    zIndex: 0,
    interactionDefaults: { isDraggable: false, isResizable: false, isRotatable: false },
    containerStyle: (a) => ({
      mixBlendMode: blendModeToCss(a.blendMode ?? PdfBlendMode.Multiply),
    }),
  }),

  createRenderer<PdfUnderlineAnnoObject>({
    id: 'underline',
    matches: (a): a is PdfUnderlineAnnoObject => a.type === PdfAnnotationSubtype.UNDERLINE,
    render: ({ currentObject, scale, onClick }) => (
      <Underline {...currentObject} scale={scale} onClick={onClick} />
    ),
    zIndex: 0,
    interactionDefaults: { isDraggable: false, isResizable: false, isRotatable: false },
  }),

  createRenderer<PdfStrikeOutAnnoObject>({
    id: 'strikeout',
    matches: (a): a is PdfStrikeOutAnnoObject => a.type === PdfAnnotationSubtype.STRIKEOUT,
    render: ({ currentObject, scale, onClick }) => (
      <Strikeout {...currentObject} scale={scale} onClick={onClick} />
    ),
    zIndex: 0,
    interactionDefaults: { isDraggable: false, isResizable: false, isRotatable: false },
  }),

  createRenderer<PdfSquigglyAnnoObject>({
    id: 'squiggly',
    matches: (a): a is PdfSquigglyAnnoObject => a.type === PdfAnnotationSubtype.SQUIGGLY,
    render: ({ currentObject, scale, onClick }) => (
      <Squiggly {...currentObject} scale={scale} onClick={onClick} />
    ),
    zIndex: 0,
    interactionDefaults: { isDraggable: false, isResizable: false, isRotatable: false },
  }),

  // --- FreeText ---

  createRenderer<PdfFreeTextAnnoObject>({
    id: 'freeText',
    matches: (a): a is PdfFreeTextAnnoObject => a.type === PdfAnnotationSubtype.FREETEXT,
    render: ({
      annotation,
      currentObject,
      isSelected,
      isEditing,
      scale,
      pageIndex,
      onClick,
      appearanceActive,
    }) => (
      <FreeText
        isSelected={isSelected}
        isEditing={isEditing}
        annotation={{ ...annotation, object: currentObject }}
        pageIndex={pageIndex}
        scale={scale}
        onClick={onClick}
        appearanceActive={appearanceActive}
      />
    ),
    interactionDefaults: { isDraggable: true, isResizable: true, isRotatable: true },
    isDraggable: (toolDraggable, { isEditing }) => toolDraggable && !isEditing,
    onDoubleClick: (id, setEditingId) => setEditingId(id),
  }),

  // --- Stamp ---

  createRenderer<PdfStampAnnoObject>({
    id: 'stamp',
    matches: (a): a is PdfStampAnnoObject => a.type === PdfAnnotationSubtype.STAMP,
    render: ({ annotation, isSelected, documentId, pageIndex, scale, onClick }) => (
      <Stamp
        isSelected={isSelected}
        annotation={annotation}
        documentId={documentId}
        pageIndex={pageIndex}
        scale={scale}
        onClick={onClick}
      />
    ),
    useAppearanceStream: false,
    interactionDefaults: { isDraggable: true, isResizable: true, isRotatable: true },
  }),

  // --- Link ---

  createRenderer<PdfLinkAnnoObject>({
    id: 'link',
    matches: (a): a is PdfLinkAnnoObject => a.type === PdfAnnotationSubtype.LINK,
    render: ({ currentObject, isSelected, scale, onClick }) => (
      <Link
        {...currentObject}
        isSelected={isSelected}
        scale={scale}
        onClick={onClick}
        hasIRT={!!currentObject.inReplyToId}
      />
    ),
    interactionDefaults: {
      isDraggable: false,
      isResizable: false,
      isRotatable: false,
    },
    useAppearanceStream: false,
    selectOverride: (e, annotation, helpers) => {
      e.stopPropagation();
      helpers.clearSelection();
      if (annotation.object.inReplyToId) {
        const parent = helpers.allAnnotations.find(
          (a) => a.object.id === annotation.object.inReplyToId,
        );
        if (parent) {
          helpers.selectAnnotation(parent.object.pageIndex, parent.object.id);
          return;
        }
      }
      helpers.selectAnnotation(helpers.pageIndex, annotation.object.id);
    },
    hideSelectionMenu: (a) => !!a.inReplyToId,
  }),
];
