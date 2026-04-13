import {
  PdfAnnotationSubtype,
  PdfAnnotationObject,
  PdfBlendMode,
  blendModeToCss,
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
  PdfCaretAnnoObject,
  PdfTextAnnoObject,
} from '@embedpdf/models';
import type {
  LinkPreviewData,
  InkPreviewData,
  CirclePreviewData,
  SquarePreviewData,
  LinePreviewData,
  PolylinePreviewData,
  PolygonPreviewData,
  FreeTextPreviewData,
  StampPreviewData,
} from '@embedpdf/plugin-annotation';
import { patching } from '@embedpdf/plugin-annotation';
import type {
  BoxedAnnotationRenderer,
  AnnotationInteractionEvent,
  SelectOverrideHelpers,
} from '../context';
import { createRenderer } from '../context/renderer-registry.svelte';
import LinkLockedMode from './annotations/LinkLockedMode.svelte';
import LinkPreview from './annotations/LinkPreview.svelte';
import InkPreview from './annotations/InkPreview.svelte';
import SquarePreview from './annotations/SquarePreview.svelte';
import CirclePreview from './annotations/CirclePreview.svelte';
import LinePreview from './annotations/LinePreview.svelte';
import PolylinePreview from './annotations/PolylinePreview.svelte';
import PolygonPreview from './annotations/PolygonPreview.svelte';
import FreeTextPreview from './annotations/FreeTextPreview.svelte';
import CalloutFreeTextPreview from './annotations/CalloutFreeTextPreview.svelte';
import StampPreview from './annotations/StampPreview.svelte';

import InkWrapper from './renderers/InkRenderer.svelte';
import SquareWrapper from './renderers/SquareRenderer.svelte';
import CircleWrapper from './renderers/CircleRenderer.svelte';
import LineWrapper from './renderers/LineRenderer.svelte';
import PolylineWrapper from './renderers/PolylineRenderer.svelte';
import PolygonWrapper from './renderers/PolygonRenderer.svelte';
import FreeTextWrapper from './renderers/FreeTextRenderer.svelte';
import CalloutFreeTextWrapper from './renderers/CalloutFreeTextRenderer.svelte';
import StampWrapper from './renderers/StampRenderer.svelte';
import LinkWrapper from './renderers/LinkRenderer.svelte';
import HighlightWrapper from './renderers/HighlightRenderer.svelte';
import UnderlineWrapper from './renderers/UnderlineRenderer.svelte';
import StrikeoutWrapper from './renderers/StrikeoutRenderer.svelte';
import SquigglyWrapper from './renderers/SquigglyRenderer.svelte';
import CaretWrapper from './renderers/CaretRenderer.svelte';
import TextWrapper from './renderers/TextRenderer.svelte';

export const builtInRenderers: BoxedAnnotationRenderer[] = [
  createRenderer<PdfInkAnnoObject, InkPreviewData>({
    id: 'ink',
    matches: (a): a is PdfInkAnnoObject => a.type === PdfAnnotationSubtype.INK,
    matchesPreview: (p) => p.type === PdfAnnotationSubtype.INK,
    component: InkWrapper,
    renderPreview: InkPreview,
    previewContainerStyle: ({ data }) =>
      `mix-blend-mode:${blendModeToCss(data.blendMode ?? PdfBlendMode.Normal)}`,
    interactionDefaults: { isDraggable: true, isResizable: true, isRotatable: true },
  }),

  createRenderer<PdfSquareAnnoObject, SquarePreviewData>({
    id: 'square',
    matches: (a): a is PdfSquareAnnoObject => a.type === PdfAnnotationSubtype.SQUARE,
    matchesPreview: (p) => p.type === PdfAnnotationSubtype.SQUARE,
    component: SquareWrapper,
    renderPreview: SquarePreview,
    interactionDefaults: { isDraggable: true, isResizable: true, isRotatable: true },
  }),

  createRenderer<PdfCircleAnnoObject, CirclePreviewData>({
    id: 'circle',
    matches: (a): a is PdfCircleAnnoObject => a.type === PdfAnnotationSubtype.CIRCLE,
    matchesPreview: (p) => p.type === PdfAnnotationSubtype.CIRCLE,
    component: CircleWrapper,
    renderPreview: CirclePreview,
    interactionDefaults: { isDraggable: true, isResizable: true, isRotatable: true },
  }),

  createRenderer<PdfLineAnnoObject, LinePreviewData>({
    id: 'line',
    matches: (a): a is PdfLineAnnoObject => a.type === PdfAnnotationSubtype.LINE,
    matchesPreview: (p) => p.type === PdfAnnotationSubtype.LINE,
    component: LineWrapper,
    renderPreview: LinePreview,
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
    component: PolylineWrapper,
    renderPreview: PolylinePreview,
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
    component: PolygonWrapper,
    renderPreview: PolygonPreview,
    vertexConfig: {
      extractVertices: (a) => a.vertices,
      transformAnnotation: (a, vertices) => ({ ...a, vertices }),
    },
    interactionDefaults: { isDraggable: true, isResizable: false, isRotatable: true },
  }),

  createRenderer<PdfHighlightAnnoObject>({
    id: 'highlight',
    matches: (a): a is PdfHighlightAnnoObject => a.type === PdfAnnotationSubtype.HIGHLIGHT,
    component: HighlightWrapper,
    zIndex: 0,
    interactionDefaults: { isDraggable: false, isResizable: false, isRotatable: false },
    defaultBlendMode: PdfBlendMode.Multiply,
  }),

  createRenderer<PdfUnderlineAnnoObject>({
    id: 'underline',
    matches: (a): a is PdfUnderlineAnnoObject => a.type === PdfAnnotationSubtype.UNDERLINE,
    component: UnderlineWrapper,
    zIndex: 0,
    interactionDefaults: { isDraggable: false, isResizable: false, isRotatable: false },
  }),

  createRenderer<PdfStrikeOutAnnoObject>({
    id: 'strikeout',
    matches: (a): a is PdfStrikeOutAnnoObject => a.type === PdfAnnotationSubtype.STRIKEOUT,
    component: StrikeoutWrapper,
    zIndex: 0,
    interactionDefaults: { isDraggable: false, isResizable: false, isRotatable: false },
  }),

  createRenderer<PdfSquigglyAnnoObject>({
    id: 'squiggly',
    matches: (a): a is PdfSquigglyAnnoObject => a.type === PdfAnnotationSubtype.SQUIGGLY,
    component: SquigglyWrapper,
    zIndex: 0,
    interactionDefaults: { isDraggable: false, isResizable: false, isRotatable: false },
  }),

  createRenderer<PdfTextAnnoObject>({
    id: 'text',
    matches: (a): a is PdfTextAnnoObject => a.type === PdfAnnotationSubtype.TEXT && !a.inReplyToId,
    component: TextWrapper,
    interactionDefaults: { isDraggable: true, isResizable: false, isRotatable: false },
  }),

  createRenderer<PdfCaretAnnoObject>({
    id: 'caret',
    matches: (a): a is PdfCaretAnnoObject => a.type === PdfAnnotationSubtype.CARET,
    component: CaretWrapper,
    interactionDefaults: { isDraggable: false, isResizable: false, isRotatable: false },
  }),

  createRenderer<PdfFreeTextAnnoObject, FreeTextPreviewData>({
    id: 'freeTextCallout',
    matches: (a): a is PdfFreeTextAnnoObject =>
      a.type === PdfAnnotationSubtype.FREETEXT && a.intent === 'FreeTextCallout',
    matchesPreview: (p) => p.type === PdfAnnotationSubtype.FREETEXT && !!p.data.calloutLine,
    component: CalloutFreeTextWrapper,
    renderPreview: CalloutFreeTextPreview,
    vertexConfig: patching.calloutVertexConfig,
    interactionDefaults: { isDraggable: true, isResizable: false, isRotatable: false },
    isDraggable: (toolDraggable, { isEditing }) => toolDraggable && !isEditing,
    onDoubleClick: (id, setEditingId) => setEditingId(id),
  }),

  createRenderer<PdfFreeTextAnnoObject, FreeTextPreviewData>({
    id: 'freeText',
    matches: (a): a is PdfFreeTextAnnoObject =>
      a.type === PdfAnnotationSubtype.FREETEXT && a.intent !== 'FreeTextCallout',
    matchesPreview: (p) => p.type === PdfAnnotationSubtype.FREETEXT && !p.data.calloutLine,
    component: FreeTextWrapper,
    renderPreview: FreeTextPreview,
    interactionDefaults: { isDraggable: true, isResizable: true, isRotatable: true },
    isDraggable: (toolDraggable, { isEditing }) => toolDraggable && !isEditing,
    onDoubleClick: (id, setEditingId) => setEditingId(id),
  }),

  createRenderer<PdfStampAnnoObject, StampPreviewData>({
    id: 'stamp',
    matches: (a): a is PdfStampAnnoObject => a.type === PdfAnnotationSubtype.STAMP,
    matchesPreview: (p) => p.type === PdfAnnotationSubtype.STAMP,
    component: StampWrapper,
    renderPreview: StampPreview,
    useAppearanceStream: false,
    interactionDefaults: { isDraggable: true, isResizable: true, isRotatable: true },
  }),

  createRenderer<PdfLinkAnnoObject, LinkPreviewData>({
    id: 'link',
    matches: (a): a is PdfLinkAnnoObject => a.type === PdfAnnotationSubtype.LINK,
    matchesPreview: (p) => p.type === PdfAnnotationSubtype.LINK,
    component: LinkWrapper,
    renderPreview: LinkPreview,
    interactionDefaults: { isDraggable: true, isResizable: true, isRotatable: false },
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
    renderLocked: LinkLockedMode,
  }),
];
