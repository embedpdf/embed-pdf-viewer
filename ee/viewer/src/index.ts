/**
 * @cloudpdf/viewer — the CLOUD snippet, built as `dist/cloudpdf.js`.
 *
 * ```html
 * <div id="viewer" style="height:100vh"></div>
 * <script type="module">
 *   import CloudPDF from 'https://cdn.jsdelivr.net/npm/@cloudpdf/viewer@VERSION/dist/cloudpdf.js';
 *   CloudPDF.init({
 *     target: '#viewer',
 *     baseUrl: 'https://api.cloudpdf.com',
 *     docToken: '<doc-scoped JWT>',
 *   });
 * </script>
 * ```
 *
 * A thin wrapper over the open-source viewer's ENGINE-AGNOSTIC entry
 * (`@embedpdf/viewer/core`): it maps the cloud connection options to an
 * injected {@link cloudEngine} factory and hands everything else to
 * `EmbedPDF.init()`. Because the core entry registers no default engine,
 * the local PDFium engine — wasm, worker source, main-thread recipe — is
 * structurally absent from this artifact: rendering happens server-side,
 * so the only thing that crosses the network is HTTPS API traffic.
 */
import EmbedPDF from '@embedpdf/viewer/core';
import type { EmbedPdfViewerElement, InitOptions } from '@embedpdf/viewer/core';
import { cloudEngine, type CloudEngineOptions, type TokenSource } from '@cloudpdf/engine';

// The whole customization vocabulary rides along, so cloud snippet users
// import ONE file — same ladder as the open snippet.
export * from '@embedpdf/viewer/core';
export { cloudEngine } from '@cloudpdf/engine';
export type { CloudEngineOptions } from '@cloudpdf/engine';

export interface CloudInitOptions extends Omit<InitOptions, 'engine' | 'src'>, CloudEngineOptions {
  /** Sugar: open one document by its doc-scoped JWT (`open({ kind: 'token' })`). */
  docToken?: TokenSource;
  /** Sugar: open one document by cloud docId — the engine-level `token` must
   *  authorize it (`open({ kind: 'id' })`). */
  docId?: string;
}

/** Create an <embedpdf-viewer> backed by the cloud engine and mount it. */
function init(options: CloudInitOptions): EmbedPdfViewerElement {
  const { baseUrl, token, sessionId, fetch: fetchFn, docToken, docId, ...config } = options;

  const documents = config.documents ?? [
    ...(docToken !== undefined ? [{ source: { kind: 'token' as const, token: docToken } }] : []),
    ...(docId !== undefined ? [{ source: { kind: 'id' as const, id: docId } }] : []),
  ];

  return EmbedPDF.init({
    ...config,
    documents,
    // Thunk = viewer-owned lifetime: created on mount, destroyed on unmount.
    engine: () => cloudEngine({ baseUrl, token, sessionId, fetch: fetchFn }),
  });
}

const CloudPDF = { init };
export default CloudPDF;
