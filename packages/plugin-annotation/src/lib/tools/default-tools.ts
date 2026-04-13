import {
  PdfAnnotationBorderStyle,
  PdfAnnotationLineEnding,
  PdfAnnotationSubtype,
  PdfBlendMode,
  PdfStandardFont,
  PdfTextAlignment,
  PdfVerticalAlignment,
} from '@embedpdf/models';
import { AnnoOf } from '../helpers';
import { AnnotationTool, ToolMapFromList } from './types';
import {
  insertTextSelectionHandler,
  replaceTextSelectionHandler,
  inkHandlerFactory,
  circleHandlerFactory,
  squareHandlerFactory,
  lineHandlerFactory,
  polylineHandlerFactory,
  polygonHandlerFactory,
  textHandlerFactory,
  freeTextHandlerFactory,
  calloutFreeTextHandlerFactory,
  stampHandlerFactory,
  linkHandlerFactory,
} from '../handlers';
import {
  patchInk,
  patchLine,
  patchPolyline,
  patchPolygon,
  patchCircle,
  patchSquare,
  patchFreeText,
  patchCalloutFreeText,
  patchStamp,
} from '../patching/patches';

const textMarkupTools = [
  {
    id: 'highlight' as const,
    name: 'Highlight',
    labelKey: 'annotation.highlight',
    categories: ['annotation', 'markup'],
    matchScore: (a) => (a.type === PdfAnnotationSubtype.HIGHLIGHT ? 1 : 0),
    interaction: {
      exclusive: false,
      textSelection: true,
      isDraggable: false,
      isResizable: false,
      isRotatable: false,
      // Text markup annotations are anchored to text and should not move/resize in groups
      isGroupDraggable: false,
      isGroupResizable: false,
    },
    defaults: {
      type: PdfAnnotationSubtype.HIGHLIGHT,
      strokeColor: '#FFCD45',
      color: '#FFCD45', // deprecated alias
      opacity: 1,
      blendMode: PdfBlendMode.Multiply,
    },
  },
  {
    id: 'underline' as const,
    name: 'Underline',
    labelKey: 'annotation.underline',
    categories: ['annotation', 'markup'],
    matchScore: (a) => (a.type === PdfAnnotationSubtype.UNDERLINE ? 1 : 0),
    interaction: {
      exclusive: false,
      textSelection: true,
      isDraggable: false,
      isResizable: false,
      isRotatable: false,
      isGroupDraggable: false,
      isGroupResizable: false,
    },
    defaults: {
      type: PdfAnnotationSubtype.UNDERLINE,
      strokeColor: '#E44234',
      color: '#E44234', // deprecated alias
      opacity: 1,
    },
  },
  {
    id: 'strikeout' as const,
    name: 'Strikeout',
    labelKey: 'annotation.strikeout',
    categories: ['annotation', 'markup'],
    matchScore: (a) => (a.type === PdfAnnotationSubtype.STRIKEOUT ? 1 : 0),
    interaction: {
      exclusive: false,
      textSelection: true,
      isDraggable: false,
      isResizable: false,
      isRotatable: false,
      isGroupDraggable: false,
      isGroupResizable: false,
    },
    defaults: {
      type: PdfAnnotationSubtype.STRIKEOUT,
      strokeColor: '#E44234',
      color: '#E44234', // deprecated alias
      opacity: 1,
    },
  },
  {
    id: 'squiggly' as const,
    name: 'Squiggly',
    labelKey: 'annotation.squiggly',
    categories: ['annotation', 'markup'],
    matchScore: (a) => (a.type === PdfAnnotationSubtype.SQUIGGLY ? 1 : 0),
    interaction: {
      exclusive: false,
      textSelection: true,
      isDraggable: false,
      isResizable: false,
      isRotatable: false,
      isGroupDraggable: false,
      isGroupResizable: false,
    },
    defaults: {
      type: PdfAnnotationSubtype.SQUIGGLY,
      strokeColor: '#E44234',
      color: '#E44234', // deprecated alias
      opacity: 1,
    },
  },
] satisfies readonly AnnotationTool[];

const insertTextTools = [
  {
    id: 'insertText' as const,
    name: 'Insert Text',
    labelKey: 'annotation.insertText',
    categories: ['annotation', 'markup'],
    matchScore: (a) => {
      if (a.type !== PdfAnnotationSubtype.CARET) return 0;
      return a.intent?.includes('Insert') ? 2 : 1;
    },
    interaction: {
      exclusive: false,
      textSelection: true,
      showSelectionRects: true,
      isDraggable: false,
      isResizable: false,
      isRotatable: false,
      isGroupDraggable: false,
      isGroupResizable: false,
    },
    defaults: {
      type: PdfAnnotationSubtype.CARET,
      strokeColor: '#E44234',
      opacity: 1,
      intent: 'Insert',
    },
    selectionHandler: insertTextSelectionHandler,
  },
] satisfies readonly AnnotationTool<AnnoOf<PdfAnnotationSubtype.CARET>>[];

const replaceTextTools = [
  {
    id: 'replaceText' as const,
    name: 'Replace Text',
    labelKey: 'annotation.replaceText',
    categories: ['annotation', 'markup'],
    matchScore: (a) => {
      if (a.type === PdfAnnotationSubtype.STRIKEOUT && a.intent?.includes('StrikeOutTextEdit'))
        return 2;
      if (a.type === PdfAnnotationSubtype.CARET && a.intent?.includes('Replace')) return 2;
      return 0;
    },
    interaction: {
      exclusive: false,
      textSelection: true,
      isDraggable: false,
      isResizable: false,
      isRotatable: false,
      isGroupDraggable: false,
      isGroupResizable: false,
    },
    defaults: {
      type: PdfAnnotationSubtype.STRIKEOUT,
      strokeColor: '#E44234',
      opacity: 1,
      intent: 'StrikeOutTextEdit',
    },
    selectionHandler: replaceTextSelectionHandler,
  },
] satisfies readonly AnnotationTool<AnnoOf<PdfAnnotationSubtype.STRIKEOUT>>[];

const inkTools = [
  {
    id: 'ink' as const,
    name: 'Pen',
    labelKey: 'annotation.ink',
    categories: ['annotation', 'markup'],
    matchScore: (a) => (a.type === PdfAnnotationSubtype.INK && a.intent !== 'InkHighlight' ? 5 : 0),
    interaction: {
      exclusive: false,
      cursor: 'crosshair',
      isDraggable: true,
      isResizable: true,
      lockAspectRatio: false,
    },
    defaults: {
      type: PdfAnnotationSubtype.INK,
      strokeColor: '#E44234',
      color: '#E44234', // deprecated alias
      opacity: 1,
      strokeWidth: 6,
    },
    behavior: {
      commitDelay: 800,
    },
    transform: patchInk,
    pointerHandler: inkHandlerFactory,
  },
  {
    id: 'inkHighlighter' as const,
    name: 'Ink Highlighter',
    labelKey: 'annotation.inkHighlighter',
    categories: ['annotation', 'markup'],
    matchScore: (a) =>
      a.type === PdfAnnotationSubtype.INK && a.intent === 'InkHighlight' ? 10 : 0,
    interaction: {
      exclusive: false,
      cursor: 'crosshair',
      isDraggable: true,
      isResizable: true,
      lockAspectRatio: false,
      lockGroupAspectRatio: (a) => {
        // Lock aspect ratio when rotation is not near an orthogonal angle (within 6°)
        const r = (((a.rotation ?? 0) % 90) + 90) % 90;
        return r >= 6 && r <= 84;
      },
    },
    defaults: {
      type: PdfAnnotationSubtype.INK,
      intent: 'InkHighlight',
      strokeColor: '#FFCD45',
      color: '#FFCD45', // deprecated alias
      opacity: 1,
      strokeWidth: 14,
      blendMode: PdfBlendMode.Multiply,
    },
    behavior: {
      commitDelay: 800,
      smartLineRecognition: true,
      smartLineThreshold: 0.15,
    },
    transform: patchInk,
    pointerHandler: inkHandlerFactory,
  },
] satisfies readonly AnnotationTool<AnnoOf<PdfAnnotationSubtype.INK>>[];

const circleTools = [
  {
    id: 'circle' as const,
    name: 'Circle',
    labelKey: 'annotation.circle',
    categories: ['annotation', 'shape'],
    matchScore: (a) => (a.type === PdfAnnotationSubtype.CIRCLE ? 1 : 0),
    interaction: {
      exclusive: false,
      cursor: 'crosshair',
      isDraggable: true,
      isResizable: true,
      lockAspectRatio: false,
      lockGroupAspectRatio: (a) => {
        // Lock aspect ratio when rotation is not near an orthogonal angle (within 6°)
        const r = (((a.rotation ?? 0) % 90) + 90) % 90;
        return r >= 6 && r <= 84;
      },
    },
    defaults: {
      type: PdfAnnotationSubtype.CIRCLE,
      color: 'transparent',
      opacity: 1,
      strokeWidth: 6,
      strokeColor: '#E44234',
      strokeStyle: PdfAnnotationBorderStyle.SOLID,
    },
    clickBehavior: {
      enabled: true,
      defaultSize: { width: 100, height: 100 },
    },
    transform: patchCircle,
    pointerHandler: circleHandlerFactory,
  },
] satisfies readonly AnnotationTool<AnnoOf<PdfAnnotationSubtype.CIRCLE>>[];

const squareTools = [
  {
    id: 'square' as const,
    name: 'Square',
    labelKey: 'annotation.square',
    categories: ['annotation', 'shape'],
    matchScore: (a) => (a.type === PdfAnnotationSubtype.SQUARE ? 1 : 0),
    interaction: {
      exclusive: false,
      cursor: 'crosshair',
      isDraggable: true,
      isResizable: true,
      lockAspectRatio: false,
      lockGroupAspectRatio: (a) => {
        // Lock aspect ratio when rotation is not near an orthogonal angle (within 6°)
        const r = (((a.rotation ?? 0) % 90) + 90) % 90;
        return r >= 6 && r <= 84;
      },
    },
    defaults: {
      type: PdfAnnotationSubtype.SQUARE,
      color: 'transparent',
      opacity: 1,
      strokeWidth: 6,
      strokeColor: '#E44234',
      strokeStyle: PdfAnnotationBorderStyle.SOLID,
    },
    clickBehavior: {
      enabled: true,
      defaultSize: { width: 100, height: 100 },
    },
    transform: patchSquare,
    pointerHandler: squareHandlerFactory,
  },
] satisfies readonly AnnotationTool<AnnoOf<PdfAnnotationSubtype.SQUARE>>[];

const lineTools = [
  {
    id: 'line' as const,
    name: 'Line',
    labelKey: 'annotation.line',
    categories: ['annotation', 'shape'],
    matchScore: (a) => (a.type === PdfAnnotationSubtype.LINE && a.intent !== 'LineArrow' ? 5 : 0),
    interaction: {
      exclusive: false,
      cursor: 'crosshair',
      isDraggable: true,
      isResizable: false, // Uses vertex editing when selected individually
      lockAspectRatio: false,
      isGroupResizable: true, // Scales proportionally in a group
      lockGroupAspectRatio: (a) => {
        // Lock aspect ratio when rotation is not near an orthogonal angle (within 6°)
        const r = (((a.rotation ?? 0) % 90) + 90) % 90;
        return r >= 6 && r <= 84;
      },
    },
    defaults: {
      type: PdfAnnotationSubtype.LINE,
      color: 'transparent',
      opacity: 1,
      strokeWidth: 6,
      strokeColor: '#E44234',
    },
    clickBehavior: {
      enabled: true,
      defaultLength: 100,
      defaultAngle: 0,
    },
    transform: patchLine,
    pointerHandler: lineHandlerFactory,
  },
  {
    id: 'lineArrow' as const,
    name: 'Arrow',
    labelKey: 'annotation.arrow',
    categories: ['annotation', 'shape'],
    matchScore: (a) => (a.type === PdfAnnotationSubtype.LINE && a.intent === 'LineArrow' ? 10 : 0),
    interaction: {
      exclusive: false,
      cursor: 'crosshair',
      isDraggable: true,
      isResizable: false, // Uses vertex editing when selected individually
      lockAspectRatio: false,
      isGroupResizable: true, // Scales proportionally in a group
      lockGroupAspectRatio: (a) => {
        // Lock aspect ratio when rotation is not near an orthogonal angle (within 6°)
        const r = (((a.rotation ?? 0) % 90) + 90) % 90;
        return r >= 6 && r <= 84;
      },
    },
    defaults: {
      type: PdfAnnotationSubtype.LINE,
      intent: 'LineArrow',
      color: 'transparent',
      opacity: 1,
      strokeWidth: 6,
      strokeColor: '#E44234',
      lineEndings: {
        start: PdfAnnotationLineEnding.None,
        end: PdfAnnotationLineEnding.OpenArrow,
      },
    },
    clickBehavior: {
      enabled: true,
      defaultLength: 100,
      defaultAngle: 0,
    },
    transform: patchLine,
    pointerHandler: lineHandlerFactory,
  },
] satisfies readonly AnnotationTool<AnnoOf<PdfAnnotationSubtype.LINE>>[];

const polylineTools = [
  {
    id: 'polyline' as const,
    name: 'Polyline',
    labelKey: 'annotation.polyline',
    categories: ['annotation', 'shape'],
    matchScore: (a) => (a.type === PdfAnnotationSubtype.POLYLINE ? 1 : 0),
    interaction: {
      exclusive: false,
      cursor: 'crosshair',
      isDraggable: true,
      isResizable: false, // Uses vertex editing when selected individually
      lockAspectRatio: false,
      isGroupResizable: true, // Scales proportionally in a group
      lockGroupAspectRatio: (a) => {
        // Lock aspect ratio when rotation is not near an orthogonal angle (within 6°)
        const r = (((a.rotation ?? 0) % 90) + 90) % 90;
        return r >= 6 && r <= 84;
      },
    },
    defaults: {
      type: PdfAnnotationSubtype.POLYLINE,
      color: 'transparent',
      opacity: 1,
      strokeWidth: 6,
      strokeColor: '#E44234',
    },
    transform: patchPolyline,
    pointerHandler: polylineHandlerFactory,
  },
] satisfies readonly AnnotationTool<AnnoOf<PdfAnnotationSubtype.POLYLINE>>[];

const polygonTools = [
  {
    id: 'polygon' as const,
    name: 'Polygon',
    labelKey: 'annotation.polygon',
    categories: ['annotation', 'shape'],
    matchScore: (a) => (a.type === PdfAnnotationSubtype.POLYGON ? 1 : 0),
    interaction: {
      exclusive: false,
      cursor: 'crosshair',
      isDraggable: true,
      isResizable: false, // Uses vertex editing when selected individually
      lockAspectRatio: false,
      isGroupResizable: true, // Scales proportionally in a group
      lockGroupAspectRatio: (a) => {
        // Lock aspect ratio when rotation is not near an orthogonal angle (within 6°)
        const r = (((a.rotation ?? 0) % 90) + 90) % 90;
        return r >= 6 && r <= 84;
      },
    },
    defaults: {
      type: PdfAnnotationSubtype.POLYGON,
      color: 'transparent',
      opacity: 1,
      strokeWidth: 6,
      strokeColor: '#E44234',
    },
    transform: patchPolygon,
    pointerHandler: polygonHandlerFactory,
  },
] satisfies readonly AnnotationTool<AnnoOf<PdfAnnotationSubtype.POLYGON>>[];

const textCommentTools = [
  {
    id: 'textComment' as const,
    name: 'Comment',
    labelKey: 'annotation.text',
    categories: ['annotation', 'markup'],
    matchScore: (a) => (a.type === PdfAnnotationSubtype.TEXT && !a.inReplyToId ? 1 : 0),
    interaction: {
      exclusive: false,
      cursor: 'crosshair',
      isDraggable: true,
      isResizable: false,
      isRotatable: false,
    },
    defaults: {
      type: PdfAnnotationSubtype.TEXT,
      strokeColor: '#FFCD45',
      opacity: 1,
    },
    behavior: {
      selectAfterCreate: true,
    },
    pointerHandler: textHandlerFactory,
  },
] satisfies readonly AnnotationTool<AnnoOf<PdfAnnotationSubtype.TEXT>>[];

const freeTextTools = [
  {
    id: 'freeText' as const,
    name: 'Free Text',
    labelKey: 'annotation.freeText',
    categories: ['annotation', 'markup'],
    matchScore: (a) =>
      a.type === PdfAnnotationSubtype.FREETEXT && a.intent !== 'FreeTextCallout' ? 1 : 0,
    interaction: {
      exclusive: false,
      cursor: 'crosshair',
      isDraggable: true,
      isResizable: true,
      lockAspectRatio: false,
      lockGroupAspectRatio: (a) => {
        // Lock aspect ratio when rotation is not near an orthogonal angle (within 6°)
        const r = (((a.rotation ?? 0) % 90) + 90) % 90;
        return r >= 6 && r <= 84;
      },
    },
    defaults: {
      type: PdfAnnotationSubtype.FREETEXT,
      contents: 'Insert text',
      fontSize: 14,
      fontColor: '#E44234',
      fontFamily: PdfStandardFont.Helvetica,
      textAlign: PdfTextAlignment.Left,
      verticalAlign: PdfVerticalAlignment.Top,
      color: 'transparent', // fill color (matches shape convention)
      backgroundColor: 'transparent', // deprecated alias
      opacity: 1,
    },
    clickBehavior: {
      enabled: true,
      defaultSize: { width: 100, height: 20 },
      defaultContent: 'Insert text',
    },
    behavior: {
      insertUpright: true,
      editAfterCreate: true,
      selectAfterCreate: true,
    },
    transform: patchFreeText,
    pointerHandler: freeTextHandlerFactory,
  },
] satisfies readonly AnnotationTool<AnnoOf<PdfAnnotationSubtype.FREETEXT>>[];

const calloutFreeTextTools = [
  {
    id: 'freeTextCallout' as const,
    name: 'Callout',
    labelKey: 'annotation.callout',
    categories: ['annotation', 'markup'],
    matchScore: (a) =>
      a.type === PdfAnnotationSubtype.FREETEXT && a.intent === 'FreeTextCallout' ? 10 : 0,
    interaction: {
      exclusive: false,
      cursor: 'crosshair',
      isDraggable: true,
      isResizable: false,
      isRotatable: false,
    },
    defaults: {
      type: PdfAnnotationSubtype.FREETEXT,
      intent: 'FreeTextCallout',
      contents: 'Insert text',
      fontSize: 14,
      fontColor: '#E44234',
      fontFamily: PdfStandardFont.Helvetica,
      textAlign: PdfTextAlignment.Left,
      verticalAlign: PdfVerticalAlignment.Top,
      color: 'transparent',
      opacity: 1,
      lineEnding: PdfAnnotationLineEnding.OpenArrow,
      strokeColor: '#E44234',
      strokeWidth: 1,
    },
    behavior: {
      insertUpright: true,
      editAfterCreate: true,
      selectAfterCreate: true,
    },
    transform: patchCalloutFreeText,
    pointerHandler: calloutFreeTextHandlerFactory,
  },
] satisfies readonly AnnotationTool<AnnoOf<PdfAnnotationSubtype.FREETEXT>>[];

const stampTools = [
  {
    id: 'stamp' as const,
    name: 'Image',
    labelKey: 'annotation.stamp',
    categories: ['annotation', 'markup'],
    matchScore: (a) => (a.type === PdfAnnotationSubtype.STAMP ? 1 : 0),
    interaction: {
      exclusive: false,
      cursor: 'copy',
      isDraggable: true,
      isResizable: true,
      lockAspectRatio: true,
      lockGroupAspectRatio: true,
    },
    defaults: {
      type: PdfAnnotationSubtype.STAMP,
      // No imageSrc by default, which tells the UI to open a file picker
    },
    behavior: {
      insertUpright: true,
      useAppearanceStream: false,
    },
    transform: patchStamp,
    pointerHandler: stampHandlerFactory,
  },
] satisfies readonly AnnotationTool<AnnoOf<PdfAnnotationSubtype.STAMP>>[];

const linkTools = [
  {
    id: 'link' as const,
    name: 'Link',
    labelKey: 'annotation.link',
    categories: ['annotation', 'markup'],
    matchScore: (a) => (a.type === PdfAnnotationSubtype.LINK ? 1 : 0),
    interaction: {
      exclusive: false,
      cursor: 'crosshair',
      isDraggable: true,
      isResizable: true,
      isRotatable: false,
    },
    defaults: {
      type: PdfAnnotationSubtype.LINK,
      strokeColor: '#0000FF',
      strokeWidth: 2,
      strokeStyle: PdfAnnotationBorderStyle.UNDERLINE,
    },
    clickBehavior: {
      enabled: true,
      defaultSize: { width: 100, height: 20 },
    },
    pointerHandler: linkHandlerFactory,
  },
] satisfies readonly AnnotationTool<AnnoOf<PdfAnnotationSubtype.LINK>>[];

export const defaultTools = [
  ...textMarkupTools,
  ...insertTextTools,
  ...replaceTextTools,
  ...inkTools,
  ...circleTools,
  ...squareTools,
  ...lineTools,
  ...polylineTools,
  ...polygonTools,
  ...textCommentTools,
  ...freeTextTools,
  ...calloutFreeTextTools,
  ...stampTools,
  ...linkTools,
];

export type DefaultAnnotationTool = (typeof defaultTools)[number];
export type DefaultAnnotationToolMap = ToolMapFromList<typeof defaultTools>;
