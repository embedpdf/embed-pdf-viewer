import {
  PdfAnnotationSubtype,
  PdfAnnotationObject,
  PdfInkAnnoObject,
  PdfSquareAnnoObject,
  PdfCircleAnnoObject,
  PdfLineAnnoObject,
  PdfPolylineAnnoObject,
  PdfPolygonAnnoObject,
  PdfTextAnnoObject,
  PdfFreeTextAnnoObject,
  PdfStampAnnoObject,
  PdfLinkAnnoObject,
  PdfHighlightAnnoObject,
  PdfUnderlineAnnoObject,
  PdfStrikeOutAnnoObject,
  PdfSquigglyAnnoObject,
  PdfCaretAnnoObject,
  PdfBlendMode,
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
import { Text } from './annotations/text';
import { FreeText } from './annotations/free-text';
import { CalloutFreeText } from './annotations/callout-free-text';
import { CalloutFreeTextPreview } from './annotations/callout-free-text-preview';
import { Stamp } from './annotations/stamp';
import { Link } from './annotations/link';
import { Highlight } from './text-markup/highlight';
import { Underline } from './text-markup/underline';
import { Strikeout } from './text-markup/strikeout';
import { Squiggly } from './text-markup/squiggly';
import { Caret } from './annotations/caret';
import { LinkLockedMode } from './annotations/link-locked';
import {
  LinkPreviewData,
  InkPreviewData,
  CirclePreviewData,
  SquarePreviewData,
  LinePreviewData,
  PolylinePreviewData,
  PolygonPreviewData,
  FreeTextPreviewData,
  StampPreviewData,
  patching,
} from '@embedpdf/plugin-annotation';

export const builtInRenderers: BoxedAnnotationRenderer[] = [
  // --- Drawing ---

  createRenderer<PdfInkAnnoObject, InkPreviewData>({
    id: 'ink',
    matches: (a): a is PdfInkAnnoObject => a.type === PdfAnnotationSubtype.INK,
    matchesPreview: (p) => p.type === PdfAnnotationSubtype.INK,
    render: ({ currentObject, isSelected, scale, onClick, appearanceActive }) => (
      <Ink
        {...currentObject}
        isSelected={isSelected}
        scale={scale}
        onClick={onClick}
        appearanceActive={appearanceActive}
      />
    ),
    renderPreview: ({ data, scale }) => <Ink isSelected={false} scale={scale} {...data} />,
    previewContainerStyle: ({ data }) => ({
      mixBlendMode: blendModeToCss(data.blendMode ?? PdfBlendMode.Normal),
    }),
    interactionDefaults: { isDraggable: true, isResizable: true, isRotatable: true },
  }),

  // --- Shapes ---

  createRenderer<PdfSquareAnnoObject, SquarePreviewData>({
    id: 'square',
    matches: (a): a is PdfSquareAnnoObject => a.type === PdfAnnotationSubtype.SQUARE,
    matchesPreview: (p) => p.type === PdfAnnotationSubtype.SQUARE,
    render: ({ currentObject, isSelected, scale, onClick, appearanceActive }) => (
      <Square
        {...currentObject}
        isSelected={isSelected}
        scale={scale}
        onClick={onClick}
        appearanceActive={appearanceActive}
      />
    ),
    renderPreview: ({ data, scale }) => <Square isSelected={false} scale={scale} {...data} />,
    interactionDefaults: { isDraggable: true, isResizable: true, isRotatable: true },
  }),

  createRenderer<PdfCircleAnnoObject, CirclePreviewData>({
    id: 'circle',
    matches: (a): a is PdfCircleAnnoObject => a.type === PdfAnnotationSubtype.CIRCLE,
    matchesPreview: (p) => p.type === PdfAnnotationSubtype.CIRCLE,
    render: ({ currentObject, isSelected, scale, onClick, appearanceActive }) => (
      <Circle
        {...currentObject}
        isSelected={isSelected}
        scale={scale}
        onClick={onClick}
        appearanceActive={appearanceActive}
      />
    ),
    renderPreview: ({ data, scale }) => <Circle isSelected={false} scale={scale} {...data} />,
    interactionDefaults: { isDraggable: true, isResizable: true, isRotatable: true },
  }),

  // --- Lines & Vertex-based ---

  createRenderer<PdfLineAnnoObject, LinePreviewData>({
    id: 'line',
    matches: (a): a is PdfLineAnnoObject => a.type === PdfAnnotationSubtype.LINE,
    matchesPreview: (p) => p.type === PdfAnnotationSubtype.LINE,
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
    renderPreview: ({ data, scale }) => <Line isSelected={false} scale={scale} {...data} />,
    vertexConfig: {
      extractVertices: (a) => [a.linePoints.start, a.linePoints.end],
      transformAnnotation: (a, v) => ({
        ...a,
        linePoints: { start: v[0], end: v[1] },
      }),
    },
    interactionDefaults: { isDraggable: true, isResizable: false, isRotatable: true },
  }),

  createRenderer<PdfPolylineAnnoObject, PolylinePreviewData>({
    id: 'polyline',
    matches: (a): a is PdfPolylineAnnoObject => a.type === PdfAnnotationSubtype.POLYLINE,
    matchesPreview: (p) => p.type === PdfAnnotationSubtype.POLYLINE,
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
    renderPreview: ({ data, scale }) => <Polyline isSelected={false} scale={scale} {...data} />,
    vertexConfig: {
      extractVertices: (a) => a.vertices,
      transformAnnotation: (a, vertices) => ({ ...a, vertices }),
    },
    interactionDefaults: { isDraggable: true, isResizable: false, isRotatable: true },
  }),

  createRenderer<PdfPolygonAnnoObject, PolygonPreviewData>({
    id: 'polygon',
    matches: (a): a is PdfPolygonAnnoObject => a.type === PdfAnnotationSubtype.POLYGON,
    matchesPreview: (p) => p.type === PdfAnnotationSubtype.POLYGON,
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
    renderPreview: ({ data, scale }) => <Polygon isSelected={false} scale={scale} {...data} />,
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
    render: ({ currentObject, scale, onClick, appearanceActive }) => (
      <Highlight
        {...currentObject}
        scale={scale}
        onClick={onClick}
        appearanceActive={appearanceActive}
      />
    ),
    zIndex: 0,
    interactionDefaults: { isDraggable: false, isResizable: false, isRotatable: false },
    defaultBlendMode: PdfBlendMode.Multiply,
  }),

  createRenderer<PdfUnderlineAnnoObject>({
    id: 'underline',
    matches: (a): a is PdfUnderlineAnnoObject => a.type === PdfAnnotationSubtype.UNDERLINE,
    render: ({ currentObject, scale, onClick, appearanceActive }) => (
      <Underline
        {...currentObject}
        scale={scale}
        onClick={onClick}
        appearanceActive={appearanceActive}
      />
    ),
    zIndex: 0,
    interactionDefaults: { isDraggable: false, isResizable: false, isRotatable: false },
  }),

  createRenderer<PdfStrikeOutAnnoObject>({
    id: 'strikeout',
    matches: (a): a is PdfStrikeOutAnnoObject => a.type === PdfAnnotationSubtype.STRIKEOUT,
    render: ({ currentObject, scale, onClick, appearanceActive }) => (
      <Strikeout
        {...currentObject}
        scale={scale}
        onClick={onClick}
        appearanceActive={appearanceActive}
      />
    ),
    zIndex: 0,
    interactionDefaults: { isDraggable: false, isResizable: false, isRotatable: false },
  }),

  createRenderer<PdfSquigglyAnnoObject>({
    id: 'squiggly',
    matches: (a): a is PdfSquigglyAnnoObject => a.type === PdfAnnotationSubtype.SQUIGGLY,
    render: ({ currentObject, scale, onClick, appearanceActive }) => (
      <Squiggly
        {...currentObject}
        scale={scale}
        onClick={onClick}
        appearanceActive={appearanceActive}
      />
    ),
    zIndex: 0,
    interactionDefaults: { isDraggable: false, isResizable: false, isRotatable: false },
  }),

  // --- Text Comment ---

  createRenderer<PdfTextAnnoObject>({
    id: 'text',
    matches: (a): a is PdfTextAnnoObject => a.type === PdfAnnotationSubtype.TEXT && !a.inReplyToId,
    render: ({ currentObject, isSelected, onClick, appearanceActive }) => (
      <Text
        isSelected={isSelected}
        color={currentObject.strokeColor ?? currentObject.color}
        opacity={currentObject.opacity}
        onClick={onClick}
        appearanceActive={appearanceActive}
      />
    ),
    interactionDefaults: { isDraggable: true, isResizable: false, isRotatable: false },
  }),

  // --- Caret ---

  createRenderer<PdfCaretAnnoObject>({
    id: 'caret',
    matches: (a): a is PdfCaretAnnoObject => a.type === PdfAnnotationSubtype.CARET,
    render: ({ currentObject, isSelected, scale, onClick, appearanceActive }) => (
      <Caret
        {...currentObject}
        isSelected={isSelected}
        scale={scale}
        onClick={onClick}
        appearanceActive={appearanceActive}
      />
    ),
    interactionDefaults: { isDraggable: false, isResizable: false, isRotatable: false },
  }),

  // --- Callout FreeText (must appear before regular FreeText to match first) ---

  createRenderer<PdfFreeTextAnnoObject, FreeTextPreviewData>({
    id: 'freeTextCallout',
    matches: (a): a is PdfFreeTextAnnoObject =>
      a.type === PdfAnnotationSubtype.FREETEXT && a.intent === 'FreeTextCallout',
    matchesPreview: (p) => p.type === PdfAnnotationSubtype.FREETEXT && !!p.data.calloutLine,
    render: ({
      annotation,
      currentObject,
      isSelected,
      isEditing,
      scale,
      pageIndex,
      documentId,
      onClick,
      appearanceActive,
    }) => (
      <CalloutFreeText
        documentId={documentId}
        isSelected={isSelected}
        isEditing={isEditing}
        annotation={{ ...annotation, object: currentObject }}
        pageIndex={pageIndex}
        scale={scale}
        onClick={onClick}
        appearanceActive={appearanceActive}
      />
    ),
    renderPreview: ({ data, bounds, scale }) => (
      <CalloutFreeTextPreview
        calloutLine={data.calloutLine}
        textBox={data.textBox}
        bounds={bounds}
        scale={scale}
        strokeColor={data.strokeColor}
        strokeWidth={data.strokeWidth}
        color={data.color}
        backgroundColor={data.backgroundColor}
        opacity={data.opacity}
        lineEnding={data.lineEnding}
      />
    ),
    vertexConfig: patching.calloutVertexConfig,
    interactionDefaults: { isDraggable: true, isResizable: false, isRotatable: false },
    isDraggable: (toolDraggable, { isEditing }) => toolDraggable && !isEditing,
    onDoubleClick: (id, setEditingId) => setEditingId(id),
  }),

  // --- FreeText ---

  createRenderer<PdfFreeTextAnnoObject, FreeTextPreviewData>({
    id: 'freeText',
    matches: (a): a is PdfFreeTextAnnoObject =>
      a.type === PdfAnnotationSubtype.FREETEXT && a.intent !== 'FreeTextCallout',
    matchesPreview: (p) => p.type === PdfAnnotationSubtype.FREETEXT && !p.data.calloutLine,
    render: ({
      annotation,
      currentObject,
      isSelected,
      isEditing,
      scale,
      pageIndex,
      documentId,
      onClick,
      appearanceActive,
    }) => (
      <FreeText
        documentId={documentId}
        isSelected={isSelected}
        isEditing={isEditing}
        annotation={{ ...annotation, object: currentObject }}
        pageIndex={pageIndex}
        scale={scale}
        onClick={onClick}
        appearanceActive={appearanceActive}
      />
    ),
    renderPreview: ({ data }) => (
      <div
        style={{
          width: '100%',
          height: '100%',
          border: `1px dashed ${data.fontColor || '#000000'}`,
          backgroundColor: 'transparent',
        }}
      />
    ),
    interactionDefaults: { isDraggable: true, isResizable: true, isRotatable: true },
    isDraggable: (toolDraggable, { isEditing }) => toolDraggable && !isEditing,
    onDoubleClick: (id, setEditingId) => setEditingId(id),
  }),

  // --- Stamp ---

  createRenderer<PdfStampAnnoObject, StampPreviewData>({
    id: 'stamp',
    matches: (a): a is PdfStampAnnoObject => a.type === PdfAnnotationSubtype.STAMP,
    matchesPreview: (p) => p.type === PdfAnnotationSubtype.STAMP,
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
    renderPreview: ({ data }) => {
      const rotationDeg = ((4 - data.pageRotation) % 4) * 90;
      return (
        <img
          src={data.ghostUrl}
          style={{
            width: '100%',
            height: '100%',
            opacity: 0.6,
            objectFit: 'contain' as const,
            pointerEvents: 'none' as const,
            transform: rotationDeg ? `rotate(${rotationDeg}deg)` : undefined,
          }}
          alt=""
        />
      );
    },
    useAppearanceStream: false,
    interactionDefaults: { isDraggable: true, isResizable: true, isRotatable: true },
  }),

  // --- Link ---

  createRenderer<PdfLinkAnnoObject, LinkPreviewData>({
    id: 'link',
    matches: (a): a is PdfLinkAnnoObject => a.type === PdfAnnotationSubtype.LINK,
    matchesPreview: (p) => p.type === PdfAnnotationSubtype.LINK,
    render: ({ currentObject, isSelected, scale, onClick }) => (
      <Link
        {...currentObject}
        isSelected={isSelected}
        scale={scale}
        onClick={onClick}
        hasIRT={!!currentObject.inReplyToId}
      />
    ),
    renderPreview: ({ data, bounds, scale }) => (
      <div
        style={{
          position: 'absolute' as const,
          left: 0,
          top: 0,
          width: bounds.size.width * scale,
          height: bounds.size.height * scale,
          borderBottom: `${data.strokeWidth * scale}px solid ${data.strokeColor}`,
          backgroundColor: 'rgba(0, 0, 255, 0.05)',
          boxSizing: 'border-box' as const,
        }}
      />
    ),
    interactionDefaults: {
      isDraggable: true,
      isResizable: true,
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
    renderLocked: (props) => <LinkLockedMode {...props} />,
  }),
];
