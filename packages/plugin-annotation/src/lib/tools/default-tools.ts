import {
  PdfAnnotationBorderStyle,
  PdfAnnotationLineEnding,
  PdfAnnotationSubtype,
  PdfBlendMode,
  PdfStandardFont,
  PdfTextAlignment,
  PdfVerticalAlignment,
} from '@embedpdf/models';
import { AnnotationTool } from './types';

export const defaultTools = [
  // Text Markup Tools
  {
    id: 'highlight' as const,
    name: 'Highlight',
    matchScore: (a) => (a.type === PdfAnnotationSubtype.HIGHLIGHT ? 1 : 0),
    interaction: {
      exclusive: false,
      textSelection: true,
      isDraggable: false,
      isResizable: false,
    },
    defaults: {
      type: PdfAnnotationSubtype.HIGHLIGHT,
      color: '#FFCD45',
      opacity: 1,
      blendMode: PdfBlendMode.Multiply,
    },
  },
  {
    id: 'underline' as const,
    name: 'Underline',
    matchScore: (a) => (a.type === PdfAnnotationSubtype.UNDERLINE ? 1 : 0),
    interaction: {
      exclusive: false,
      textSelection: true,
      isDraggable: false,
      isResizable: false,
    },
    defaults: {
      type: PdfAnnotationSubtype.UNDERLINE,
      color: '#E44234',
      opacity: 1,
    },
  },
  {
    id: 'strikeout' as const,
    name: 'Strikeout',
    matchScore: (a) => (a.type === PdfAnnotationSubtype.STRIKEOUT ? 1 : 0),
    interaction: {
      exclusive: false,
      textSelection: true,
    },
    defaults: {
      type: PdfAnnotationSubtype.STRIKEOUT,
      color: '#E44234',
      opacity: 1,
    },
  },
  {
    id: 'squiggly' as const,
    name: 'Squiggly',
    matchScore: (a) => (a.type === PdfAnnotationSubtype.SQUIGGLY ? 1 : 0),
    interaction: {
      exclusive: false,
      textSelection: true,
      isDraggable: false,
      isResizable: false,
    },
    defaults: {
      type: PdfAnnotationSubtype.SQUIGGLY,
      color: '#E44234',
      opacity: 1,
    },
  },

  // Drawing Tools
  {
    id: 'ink' as const,
    name: 'Pen',
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
      color: '#E44234',
      opacity: 1,
      strokeWidth: 6,
    },
  },
  {
    id: 'inkHighlighter' as const,
    name: 'Ink Highlighter',
    matchScore: (a) =>
      a.type === PdfAnnotationSubtype.INK && a.intent === 'InkHighlight' ? 10 : 0,
    interaction: {
      exclusive: false,
      cursor: 'crosshair',
      isDraggable: true,
      isResizable: true,
      lockAspectRatio: false,
    },
    defaults: {
      type: PdfAnnotationSubtype.INK,
      intent: 'InkHighlight',
      color: '#FFCD45',
      opacity: 1,
      strokeWidth: 14,
      blendMode: PdfBlendMode.Multiply,
    },
  },

  // Shape Tools
  {
    id: 'circle' as const,
    name: 'Circle',
    matchScore: (a) => (a.type === PdfAnnotationSubtype.CIRCLE ? 1 : 0),
    interaction: {
      exclusive: false,
      cursor: 'crosshair',
      isDraggable: true,
      isResizable: true,
      lockAspectRatio: false,
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
  },
  {
    id: 'square' as const,
    name: 'Square',
    matchScore: (a) => (a.type === PdfAnnotationSubtype.SQUARE ? 1 : 0),
    interaction: {
      exclusive: false,
      cursor: 'crosshair',
      isDraggable: true,
      isResizable: true,
      lockAspectRatio: false,
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
  },
  {
    id: 'line' as const,
    name: 'Line',
    matchScore: (a) => (a.type === PdfAnnotationSubtype.LINE && a.intent !== 'LineArrow' ? 5 : 0),
    interaction: {
      exclusive: false,
      cursor: 'crosshair',
      isDraggable: true,
      isResizable: false,
      lockAspectRatio: false,
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
  },
  {
    id: 'lineArrow' as const,
    name: 'Arrow',
    matchScore: (a) => (a.type === PdfAnnotationSubtype.LINE && a.intent === 'LineArrow' ? 10 : 0),
    interaction: {
      exclusive: false,
      cursor: 'crosshair',
      isDraggable: true,
      isResizable: false,
      lockAspectRatio: false,
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
  },
  {
    id: 'polyline' as const,
    name: 'Polyline',
    matchScore: (a) => (a.type === PdfAnnotationSubtype.POLYLINE ? 1 : 0),
    interaction: {
      exclusive: false,
      cursor: 'crosshair',
      isDraggable: true,
      isResizable: false,
      lockAspectRatio: false,
    },
    defaults: {
      type: PdfAnnotationSubtype.POLYLINE,
      color: 'transparent',
      opacity: 1,
      strokeWidth: 6,
      strokeColor: '#E44234',
    },
  },
  {
    id: 'polygon' as const,
    name: 'Polygon',
    matchScore: (a) => (a.type === PdfAnnotationSubtype.POLYGON ? 1 : 0),
    interaction: {
      exclusive: false,
      cursor: 'crosshair',
      isDraggable: true,
      isResizable: false,
      lockAspectRatio: false,
    },
    defaults: {
      type: PdfAnnotationSubtype.POLYGON,
      color: 'transparent',
      opacity: 1,
      strokeWidth: 6,
      strokeColor: '#E44234',
    },
  },

  // Text & Stamp
  {
    id: 'freeText' as const,
    name: 'Free Text',
    matchScore: (a) => (a.type === PdfAnnotationSubtype.FREETEXT ? 1 : 0),
    interaction: {
      exclusive: false,
      cursor: 'crosshair',
      isDraggable: true,
      isResizable: true,
      lockAspectRatio: false,
    },
    defaults: {
      type: PdfAnnotationSubtype.FREETEXT,
      contents: 'Insert text',
      fontSize: 14,
      fontColor: '#E44234',
      fontFamily: PdfStandardFont.Helvetica,
      textAlign: PdfTextAlignment.Left,
      verticalAlign: PdfVerticalAlignment.Top,
      backgroundColor: 'transparent',
      opacity: 1,
    },
    clickBehavior: {
      enabled: true,
      defaultSize: { width: 100, height: 20 },
      defaultContent: 'Insert text',
    },
  },
  {
    id: 'stamp' as const,
    name: 'Image',
    matchScore: (a) => (a.type === PdfAnnotationSubtype.STAMP ? 1 : 0),
    interaction: {
      exclusive: false,
      cursor: 'copy',
      isDraggable: true,
      isResizable: true,
      lockAspectRatio: true,
    },
    defaults: {
      type: PdfAnnotationSubtype.STAMP,
      // No imageSrc by default, which tells the UI to open a file picker
    },
  },
] satisfies readonly AnnotationTool[];
