/**
 * @cloudpdf/viewer — the open-source viewer with the cloud engine as its default.
 *
 * ```html
 * <embedpdf-viewer id="viewer" style="height: 100vh"></embedpdf-viewer>
 * <script type="module">
 *   import 'https://cdn.jsdelivr.net/npm/@cloudpdf/viewer@3/dist/cloudpdf.js';
 *   document.getElementById('viewer').src = { grant: 'grt_…' };
 * </script>
 * ```
 *
 * The cloud door, as `@embedpdf/viewer` is the local one: it registers the cloud engine on
 * `<embedpdf-viewer>` (./register) and is otherwise the engine-agnostic door's surface, so the
 * element, `init()` and every name are the viewer's. `.` is this for a bundler, sharing
 * `@embedpdf/viewer/core` with the app; `./snippet`, `dist/cloudpdf.js`, is the same entry built
 * whole for a script tag, its folder carrying the stamps' WebAssembly.
 */
import { initViewer, type EmbedPdfViewerElement } from '@embedpdf/viewer/core';

import type { InitOptions } from './config';
import { registerCloudEngine } from './register';

registerCloudEngine();

export * from '@embedpdf/viewer/core';
export { CLOUDPDF_SAAS_URL, cloudEngine } from '@cloudpdf/engine';
export type { CloudEngineOptions } from '@cloudpdf/engine';
// Share-session primitives for custom flows (pre-exchange to inspect a
// docId, hand-rolled password prompts, bespoke documents arrays).
export { exchangeGrant, grantSessionSource, GrantExchangeError } from '@cloudpdf/engine';
export type { GrantSession, GrantExchangeOptions } from '@cloudpdf/engine';
// The cloud's `ViewerConfig` and its documents, in place of the engine-agnostic ones `export *`
// brings: one name per door (docs/conventions/viewer-doors.md).
export type { DocumentEntry, DocumentSrc, InitOptions, ViewerConfig } from './config';

const init: (options: InitOptions) => EmbedPdfViewerElement = initViewer;

const CloudPDF = { init };
export default CloudPDF;
