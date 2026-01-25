import { PdfAnnotationSubtype, PdfRedactAnnoObject } from '@embedpdf/models';
import { AnnotationTool } from '@embedpdf/plugin-annotation';

/**
 * Redact Highlight tool - for text-based redactions using QuadPoints.
 * NOT draggable/resizable (like text markup annotations).
 */
export const redactHighlightTool: AnnotationTool<PdfRedactAnnoObject> = {
  id: 'redactHighlight',
  name: 'Redact Highlight',
  matchScore: (a) => {
    if (a.type !== PdfAnnotationSubtype.REDACT) return 0;
    // Has QuadPoints = text-based redaction
    return 'segmentRects' in a && (a as PdfRedactAnnoObject).segmentRects?.length > 0 ? 10 : 0;
  },
  interaction: {
    exclusive: false,
    textSelection: true,
    isDraggable: false,
    isResizable: false,
    isGroupDraggable: false,
    isGroupResizable: false,
  },
  defaults: {
    type: PdfAnnotationSubtype.REDACT,
    color: '#FF0000', // Interior/preview color
    overlayColor: '#000000', // Fill after redaction
    opacity: 0.3,
  },
};

/**
 * Redact Area tool - for marquee-based redactions.
 * IS draggable/resizable.
 */
export const redactAreaTool: AnnotationTool<PdfRedactAnnoObject> = {
  id: 'redactArea',
  name: 'Redact Area',
  matchScore: (a) => {
    if (a.type !== PdfAnnotationSubtype.REDACT) return 0;
    // No QuadPoints = area-based redaction
    return !('segmentRects' in a) || !(a as PdfRedactAnnoObject).segmentRects?.length ? 10 : 0;
  },
  interaction: {
    exclusive: false,
    cursor: 'crosshair',
    isDraggable: true,
    isResizable: true,
    lockAspectRatio: false,
  },
  defaults: {
    type: PdfAnnotationSubtype.REDACT,
    color: '#FF0000',
    overlayColor: '#000000',
    opacity: 0.3,
  },
};

export const redactTools = [redactHighlightTool, redactAreaTool];
