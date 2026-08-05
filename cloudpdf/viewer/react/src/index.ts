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
 * A cloud DOOR, and nothing more. It renders the open-source `<PDFViewer>` from
 * `@embedpdf/viewer-react/core` — the ENGINE-AGNOSTIC door, where `engine` is
 * required — and supplies that engine from the cloud vocabulary via
 * `resolveCloudConfig`. Because the core door registers no default engine, the
 * local PDFium engine (6 MB of wasm, the worker source, the main-thread recipe)
 * is structurally absent from your bundle: not stubbed, not aliased away,
 * simply never imported.
 *
 * Everything the open viewer accepts — `chrome`, `commands`, `icons`,
 * `strings`, `theme`, children-as-slots, `onReady` — works here unchanged (see
 * `@embedpdf/viewer-react`). This file adds the CloudPDF connection and the
 * document shorthands, and subtracts nothing.
 */
import { resolveCloudConfig, type CloudSource } from '@cloudpdf/viewer/config';
import { PDFViewer, type PDFViewerProps } from '@embedpdf/viewer-react/core';
import { createElement } from 'react';

// The open viewer's whole vocabulary rides along, so a cloud app imports ONE
// package — same ladder as the cloud snippet.
export * from '@embedpdf/viewer-react/core';
export { resolveCloudConfig } from '@cloudpdf/viewer/config';
export type { CloudSource } from '@cloudpdf/viewer/config';

/**
 * The cloud connection and document shorthands, plus every viewer option except
 * `engine` (this door supplies it) and `src` (a cloud document is named by
 * `docToken`/`docId`, not by URL).
 */
export type CloudPDFViewerProps = Omit<PDFViewerProps, 'engine' | 'documents' | 'src'> &
  CloudSource;

export function CloudPDFViewer(props: CloudPDFViewerProps) {
  return createElement(PDFViewer, resolveCloudConfig(props));
}
