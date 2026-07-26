/**
 * @embedpdf/viewer-react/core — the ENGINE-AGNOSTIC React door.
 *
 * ```tsx
 * import { PDFViewer } from '@embedpdf/viewer-react/core';
 * import { cloudEngine } from '@cloudpdf/engine';
 *
 * <PDFViewer engine={() => cloudEngine({ baseUrl, token })} documents={docs} />
 * ```
 *
 * The same <PDFViewer> as the main entry — but no default engine, so `engine`
 * is REQUIRED and takes only a real implementation (an `Engine`, or a factory
 * thunk the viewer owns the lifetime of). In exchange the local PDFium engine —
 * wasm, worker source, main-thread recipe — never enters your module graph:
 * nothing is stubbed or aliased away, it is simply not imported. Its options
 * bag is absent from the type for the same reason (there is no built-in engine
 * here for `{ assetsUrl }` to configure).
 *
 * App code that wants the batteries-included viewer should import
 * `@embedpdf/viewer-react`; this entry exists for builds that always inject
 * their own engine, and is what the CloudPDF React wrapper is built on.
 */
import '@embedpdf/viewer/core';

import type { ViewerConfig } from '@embedpdf/viewer/core';

import { PDFViewer as PDFViewerImpl, type PDFViewerExtras } from './component';

export * from '@embedpdf/viewer/core';
export type { PDFViewerExtras } from './component';

/** Props on THIS door: `engine` is required, and only a real engine satisfies it. */
export type PDFViewerProps = ViewerConfig & PDFViewerExtras;

/** The shared component, narrowed to this door's contract (no cast needed: the
 *  implementation is typed with the wider config — see ./component). */
export const PDFViewer: (props: PDFViewerProps) => ReturnType<typeof PDFViewerImpl> = PDFViewerImpl;
