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
 * A cloud DOOR over the open-source viewer's ENGINE-AGNOSTIC door
 * (`@embedpdf/viewer/core`): it maps the cloud vocabulary to an injected engine
 * factory (see ./config) and hands everything else straight to `EmbedPDF.init()`.
 * Because the core door registers no default engine, the local PDFium engine —
 * wasm, worker source, main-thread recipe — is structurally absent from this
 * artifact: rendering happens server-side, so the only thing that crosses the
 * network is HTTPS API traffic.
 */
import { cloudEngine } from '@cloudpdf/engine';
import EmbedPDF from '@embedpdf/viewer/core';
import type { EmbedPdfViewerElement, InitOptions } from '@embedpdf/viewer/core';

import { resolveCloudConfig, type CloudSource } from './config';

// The whole customization vocabulary rides along, so cloud snippet users
// import ONE file — same ladder as the open snippet.
export * from '@embedpdf/viewer/core';
export { cloudEngine } from '@cloudpdf/engine';
export type { CloudEngineOptions } from '@cloudpdf/engine';
export { resolveCloudConfig } from './config';
export type { CloudSource } from './config';

export interface CloudInitOptions extends Omit<InitOptions, 'engine' | 'src'>, CloudSource {}

/** Create an <embedpdf-viewer> backed by the cloud engine and mount it. */
function init(options: CloudInitOptions): EmbedPdfViewerElement {
  return EmbedPDF.init(resolveCloudConfig(options));
}

const CloudPDF = { init };
export default CloudPDF;
