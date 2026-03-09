import { PdfAnnotationObject, PdfAnnotationSubtype } from '@embedpdf/models';
import { AnnotationTool, defineAnnotationTool } from '@embedpdf/plugin-annotation';
import { RedactionMode } from './types';

/**
 * Unified Redact tool - handles both text-based and area-based redactions.
 * Dynamically determines isDraggable/isResizable based on whether it has segmentRects.
 */
export const redactTool = defineAnnotationTool({
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
    isRotatable: false,
    lockAspectRatio: false,
    isGroupDraggable: false,
    isGroupResizable: false,
    isGroupRotatable: false,
  },
  defaults: {
    type: PdfAnnotationSubtype.REDACT,
    color: '#000000',
    overlayColor: '#FFFFFF',
    strokeColor: '#E44234',
    opacity: 1,
  },
  behavior: {
    useAppearanceStream: false,
  },
} satisfies AnnotationTool);

export const redactTools = [redactTool];
