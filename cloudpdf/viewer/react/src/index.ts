'use client';
/**
 * @cloudpdf/viewer-react — the full viewer as a React component, with the CloudPDF engine as the
 * default: the same `<PDFViewer>` as `@embedpdf/viewer-react`, whose documents live on your
 * CloudPDF.
 *
 * ```tsx
 * import { PDFViewer } from '@cloudpdf/viewer-react';
 *
 * <PDFViewer src={{ token }} style={{ height: '100vh' }} />
 * ```
 *
 * A door like the open viewer's two (docs/conventions/viewer-doors.md): it imports the cloud
 * door, which registers the cloud engine on `<embedpdf-viewer>`, re-exports the wrapper's parts,
 * and narrows `<PDFViewer>` to the cloud's `ViewerConfig`. `engine` takes the cloud engine's
 * settings (`baseUrl`, CloudPDF SaaS when left out), `src` a document token, an id or a share link.
 */
import '@cloudpdf/viewer';

import type { ViewerConfig } from '@cloudpdf/viewer';
import {
  PDFViewer as PDFViewerImpl,
  type PDFViewerExtras,
} from '@embedpdf/viewer-react/component';

export * from '@cloudpdf/viewer';
export * from '@embedpdf/viewer-react/component';

export type PDFViewerProps = ViewerConfig & PDFViewerExtras;

export const PDFViewer: (props: PDFViewerProps) => ReturnType<typeof PDFViewerImpl> = PDFViewerImpl;
