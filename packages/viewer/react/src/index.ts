'use client';
/**
 * @embedpdf/viewer-react — the full viewer as a React component, with the
 * built-in local engine (PDFium wasm in a worker) as the default.
 *
 * ```tsx
 * import { PDFViewer } from '@embedpdf/viewer-react';
 *
 * <PDFViewer src="/report.pdf" style={{ height: '100vh' }} />
 * ```
 *
 * Zero config: no `engine` prop, no bundler setup. This is the door app code
 * should use. Builds that always inject their own engine — a cloud deployment,
 * a self-hosted `@cloudpdf/server` — import `@embedpdf/viewer-react/core`
 * instead, which is the same component with PDFium structurally absent.
 *
 * The component itself lives in `./component` and is engine-blind; the one
 * import below is what makes this entry the local-engine door.
 */
import '@embedpdf/viewer';

import type { ViewerConfig } from '@embedpdf/viewer';

import { PDFViewer as PDFViewerImpl, type PDFViewerExtras } from './parts';

export * from '@embedpdf/viewer';
export * from './parts';

export type PDFViewerProps = ViewerConfig & PDFViewerExtras;

export const PDFViewer: (props: PDFViewerProps) => ReturnType<typeof PDFViewerImpl> = PDFViewerImpl;
