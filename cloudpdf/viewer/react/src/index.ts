'use client';
/**
 * @cloudpdf/viewer-react — the full viewer as a React component, wired to
 * CloudPDF.
 *
 * ```tsx
 * import { CloudPDFViewer } from '@cloudpdf/viewer-react';
 *
 * <CloudPDFViewer
 *   baseUrl="https://api.cloudpdf.com"
 *   docToken={token}
 *   style={{ height: '100vh' }}
 * />
 * ```
 *
 * A cloud door, and nothing more. It renders the open-source `<PDFViewer>` from
 * `@embedpdf/viewer-react/core` — the engine-agnostic door, where `engine` is
 * required — and supplies that engine from the cloud vocabulary via
 * `resolveCloudConfig`. Because the core door registers no default engine, the
 * local PDFium engine (6 MB of wasm, the worker source, the main-thread recipe)
 * is not part of startup. The only import of it is the lazy one the stamp
 * libraries make the first time someone opens Stamps or Signatures.
 *
 * Everything the open viewer accepts — `layout`, `commands`, `icons`,
 * `strings`, `theme`, `plugins`, children-as-slots, `onReady`,
 * `usePDFViewer()` — works here unchanged (see `@embedpdf/viewer-react`).
 * This file adds the CloudPDF connection and the document shorthands, and
 * subtracts only `scope` and `identity`, which the document's token carries.
 */
import { resolveCloudConfig, type ViewerConfig } from '@cloudpdf/viewer/config';
import { PDFViewer, type PDFViewerExtras } from '@embedpdf/viewer-react/core';
import { createElement, useState } from 'react';

// The open viewer's whole vocabulary rides along, so a cloud app imports one
// package — same ladder as the cloud snippet.
export * from '@embedpdf/viewer-react/core';
export { resolveCloudConfig } from '@cloudpdf/viewer/config';
// The cloud's `ViewerConfig`, in place of the one `export *` brings: one name per door.
export type { CloudSource, ViewerConfig } from '@cloudpdf/viewer/config';

/**
 * The cloud connection and document shorthands, plus every viewer option except
 * `engine` (this door supplies it), `src` (a cloud document is named by
 * `docToken`/`docId`, not by URL), and `scope`/`identity` (the token carries them).
 */
export type CloudPDFViewerProps = ViewerConfig & PDFViewerExtras;

export function CloudPDFViewer(props: CloudPDFViewerProps) {
  // The engine, documents and stamps are made from the cloud options once, when the viewer
  // starts, like every prop that isn't live; the live ones pass through on every render.
  const [started] = useState(() => resolveCloudConfig(props));
  const { engine, documents, stamps } = started;
  return createElement(PDFViewer, { ...resolveCloudConfig(props), engine, documents, stamps });
}
