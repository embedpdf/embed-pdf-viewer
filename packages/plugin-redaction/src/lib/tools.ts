import { PdfAnnotationObject, PdfAnnotationSubtype, PdfRedactAnnoObject } from '@embedpdf/models';
import { AnnotationTool } from '@embedpdf/plugin-annotation';
import { RedactionMode } from './types';

/**
 * Unified Redact tool - handles both text-based and area-based redactions.
 * Dynamically determines isDraggable/isResizable based on whether it has segmentRects.
 */
export const redactTool: AnnotationTool<PdfRedactAnnoObject> = {
  id: 'redact',
  name: 'Redact',
  matchScore: (a: PdfAnnotationObject) => (a.type === PdfAnnotationSubtype.REDACT ? 10 : 0),
  interaction: {
    mode: RedactionMode.Redact,
    exclusive: false,
    cursor: 'crosshair',
    textSelection: true,
    // Dynamic based on whether it's a text or area redaction
    isDraggable: (anno) => {
      if (anno.type !== PdfAnnotationSubtype.REDACT) return true;
      return !anno.segmentRects?.length;
    },
    isResizable: (anno) => {
      if (anno.type !== PdfAnnotationSubtype.REDACT) return true;
      return !anno.segmentRects?.length;
    },
    lockAspectRatio: false,
    isGroupDraggable: false,
    isGroupResizable: false,
  },
  defaults: {
    type: PdfAnnotationSubtype.REDACT,
    color: '#E44234',
    overlayColor: '#000000',
    strokeColor: '#E44234',
    opacity: 1,
  },
};

export const redactTools = [redactTool];
