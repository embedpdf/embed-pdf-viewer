import { PdfAnnotationSubtype, PdfRedactAnnoObject } from '@embedpdf/models';
import { createRenderer, BoxedAnnotationRenderer } from '@embedpdf/plugin-annotation/@framework';
import { RedactHighlight } from './annotations/redact-highlight';
import { RedactArea } from './annotations/redact-area';

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
    render: (props) => <RedactHighlight {...props} />,
  }),
  createRenderer<PdfRedactAnnoObject>({
    id: 'redactArea',
    matches: (a): a is PdfRedactAnnoObject =>
      a.type === PdfAnnotationSubtype.REDACT &&
      (!('segmentRects' in a) || !(a.segmentRects?.length ?? 0)),
    render: (props) => <RedactArea {...props} />,
  }),
];
