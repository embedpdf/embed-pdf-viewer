import { createRenderer, type BoxedAnnotationRenderer } from '@embedpdf/plugin-annotation/svelte';
import { PdfAnnotationSubtype, type PdfRedactAnnoObject } from '@embedpdf/models';
import RedactHighlight from './annotations/RedactHighlight.svelte';
import RedactArea from './annotations/RedactArea.svelte';

/**
 * Boxed annotation renderers for Redact annotations.
 * Type safety is enforced at definition time via createRenderer.
 * These are automatically registered with the annotation plugin via context.
 */
export const redactRenderers: BoxedAnnotationRenderer[] = [
  createRenderer<PdfRedactAnnoObject>({
    id: 'redactHighlight',
    matches: (a): a is PdfRedactAnnoObject =>
      a.type === PdfAnnotationSubtype.REDACT &&
      'segmentRects' in a &&
      (a.segmentRects?.length ?? 0) > 0,
    component: RedactHighlight,
  }),
  createRenderer<PdfRedactAnnoObject>({
    id: 'redactArea',
    matches: (a): a is PdfRedactAnnoObject =>
      a.type === PdfAnnotationSubtype.REDACT &&
      (!('segmentRects' in a) || !(a.segmentRects?.length ?? 0)),
    component: RedactArea,
  }),
];
