import {
  PdfAnnotationSubtype,
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
import type { BoxedAnnotationRenderer } from '../context';
import { createRenderer } from '../context/renderer-registry';
import LinkLockedMode from './annotations/link-locked.vue';
import LinkPreview from './annotations/link-preview.vue';
import InkPreview from './annotations/ink-preview.vue';
import SquarePreview from './annotations/square-preview.vue';
import CirclePreview from './annotations/circle-preview.vue';
import LinePreview from './annotations/line-preview.vue';
import PolylinePreview from './annotations/polyline-preview.vue';
import PolygonPreview from './annotations/polygon-preview.vue';
import FreeTextPreview from './annotations/free-text-preview.vue';
import CalloutFreeTextPreview from './annotations/callout-free-text-preview.vue';
import StampPreview from './annotations/stamp-preview.vue';

import InkRenderer from './renderers/ink-renderer.vue';
import SquareRenderer from './renderers/square-renderer.vue';
import CircleRenderer from './renderers/circle-renderer.vue';
import LineRenderer from './renderers/line-renderer.vue';
import PolylineRenderer from './renderers/polyline-renderer.vue';
import PolygonRenderer from './renderers/polygon-renderer.vue';
import FreeTextRenderer from './renderers/free-text-renderer.vue';
import CalloutFreeTextRenderer from './renderers/callout-free-text-renderer.vue';
import StampRenderer from './renderers/stamp-renderer.vue';
import LinkRenderer from './renderers/link-renderer.vue';
import HighlightRenderer from './renderers/highlight-renderer.vue';
import UnderlineRenderer from './renderers/underline-renderer.vue';
import StrikeoutRenderer from './renderers/strikeout-renderer.vue';
import SquigglyRenderer from './renderers/squiggly-renderer.vue';
import CaretRenderer from './renderers/caret-renderer.vue';
import TextRenderer from './renderers/text-renderer.vue';

export const builtInRenderers: BoxedAnnotationRenderer[] = [
  createRenderer<PdfInkAnnoObject, InkPreviewData>({
    id: 'ink',
    matches: (a): a is PdfInkAnnoObject => a.type === PdfAnnotationSubtype.INK,
    matchesPreview: (p) => p.type === PdfAnnotationSubtype.INK,
    component: InkRenderer,
    renderPreview: InkPreview,
    previewContainerStyle: ({ data }) => ({
      mixBlendMode: blendModeToCss(data.blendMode ?? PdfBlendMode.Normal),
    }),
    interactionDefaults: { isDraggable: true, isResizable: true, isRotatable: true },
  }),

  createRenderer<PdfSquareAnnoObject, SquarePreviewData>({
    id: 'square',
    matches: (a): a is PdfSquareAnnoObject => a.type === PdfAnnotationSubtype.SQUARE,
    matchesPreview: (p) => p.type === PdfAnnotationSubtype.SQUARE,
    component: SquareRenderer,
    renderPreview: SquarePreview,
    interactionDefaults: { isDraggable: true, isResizable: true, isRotatable: true },
  }),

  createRenderer<PdfCircleAnnoObject, CirclePreviewData>({
    id: 'circle',
    matches: (a): a is PdfCircleAnnoObject => a.type === PdfAnnotationSubtype.CIRCLE,
    matchesPreview: (p) => p.type === PdfAnnotationSubtype.CIRCLE,
    component: CircleRenderer,
    renderPreview: CirclePreview,
    interactionDefaults: { isDraggable: true, isResizable: true, isRotatable: true },
  }),

  createRenderer<PdfLineAnnoObject, LinePreviewData>({
    id: 'line',
    matches: (a): a is PdfLineAnnoObject => a.type === PdfAnnotationSubtype.LINE,
    matchesPreview: (p) => p.type === PdfAnnotationSubtype.LINE,
    component: LineRenderer,
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
    component: PolylineRenderer,
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
    component: PolygonRenderer,
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
    component: HighlightRenderer,
    zIndex: 0,
    interactionDefaults: { isDraggable: false, isResizable: false, isRotatable: false },
    defaultBlendMode: PdfBlendMode.Multiply,
  }),

  createRenderer<PdfUnderlineAnnoObject>({
    id: 'underline',
    matches: (a): a is PdfUnderlineAnnoObject => a.type === PdfAnnotationSubtype.UNDERLINE,
    component: UnderlineRenderer,
    zIndex: 0,
    interactionDefaults: { isDraggable: false, isResizable: false, isRotatable: false },
  }),

  createRenderer<PdfStrikeOutAnnoObject>({
    id: 'strikeout',
    matches: (a): a is PdfStrikeOutAnnoObject => a.type === PdfAnnotationSubtype.STRIKEOUT,
    component: StrikeoutRenderer,
    zIndex: 0,
    interactionDefaults: { isDraggable: false, isResizable: false, isRotatable: false },
  }),

  createRenderer<PdfSquigglyAnnoObject>({
    id: 'squiggly',
    matches: (a): a is PdfSquigglyAnnoObject => a.type === PdfAnnotationSubtype.SQUIGGLY,
    component: SquigglyRenderer,
    zIndex: 0,
    interactionDefaults: { isDraggable: false, isResizable: false, isRotatable: false },
  }),

  createRenderer<PdfTextAnnoObject>({
    id: 'text',
    matches: (a): a is PdfTextAnnoObject => a.type === PdfAnnotationSubtype.TEXT && !a.inReplyToId,
    component: TextRenderer,
    interactionDefaults: { isDraggable: true, isResizable: false, isRotatable: false },
  }),

  createRenderer<PdfCaretAnnoObject>({
    id: 'caret',
    matches: (a): a is PdfCaretAnnoObject => a.type === PdfAnnotationSubtype.CARET,
    component: CaretRenderer,
    interactionDefaults: { isDraggable: false, isResizable: false, isRotatable: false },
  }),

  createRenderer<PdfFreeTextAnnoObject, FreeTextPreviewData>({
    id: 'freeTextCallout',
    matches: (a): a is PdfFreeTextAnnoObject =>
      a.type === PdfAnnotationSubtype.FREETEXT && a.intent === 'FreeTextCallout',
    matchesPreview: (p) => p.type === PdfAnnotationSubtype.FREETEXT && !!p.data.calloutLine,
    component: CalloutFreeTextRenderer,
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
    component: FreeTextRenderer,
    renderPreview: FreeTextPreview,
    interactionDefaults: { isDraggable: true, isResizable: true, isRotatable: true },
    isDraggable: (toolDraggable, { isEditing }) => toolDraggable && !isEditing,
    onDoubleClick: (id, setEditingId) => setEditingId(id),
  }),

  createRenderer<PdfStampAnnoObject, StampPreviewData>({
    id: 'stamp',
    matches: (a): a is PdfStampAnnoObject => a.type === PdfAnnotationSubtype.STAMP,
    matchesPreview: (p) => p.type === PdfAnnotationSubtype.STAMP,
    component: StampRenderer,
    renderPreview: StampPreview,
    useAppearanceStream: false,
    interactionDefaults: { isDraggable: true, isResizable: true, isRotatable: true },
  }),

  createRenderer<PdfLinkAnnoObject, LinkPreviewData>({
    id: 'link',
    matches: (a): a is PdfLinkAnnoObject => a.type === PdfAnnotationSubtype.LINK,
    matchesPreview: (p) => p.type === PdfAnnotationSubtype.LINK,
    component: LinkRenderer,
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
