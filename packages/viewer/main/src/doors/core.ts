/**
 * @embedpdf/viewer/core — the ENGINE-AGNOSTIC door (`dist/core.js`).
 *
 * Everything the local door has — the element, `init()`, the customization
 * vocabulary, the DRIVE tokens — except a default engine: `engine` is REQUIRED
 * here, and takes only a real implementation (an `Engine`, or a factory thunk
 * the viewer owns the lifetime of). This is what engine-injecting builds bundle
 * (the cloud snippet wires `cloudEngine`), so the local PDFium engine — wasm,
 * worker source, main-thread recipe — is structurally absent from their module
 * graph rather than stubbed out.
 *
 * Because that engine is absent, so is its options bag: `engine: { assetsUrl }`
 * configures the BUILT-IN engine, and there is none here to configure. The type
 * says so, instead of accepting it and throwing at mount.
 *
 * This door registers no engine provider — that omission IS the door. App code
 * wanting the batteries-included viewer should import `@embedpdf/viewer`.
 */
import type { Engine, EngineFactory } from '@embedpdf/engine-core/runtime';

import {
  initViewer,
  type EmbedPdfViewerElement,
  type MountTarget,
  type ViewerConfigBase,
} from '../kernel';

export * from '../kernel';

/**
 * The engine-agnostic contract. Same public NAME as the local door's config —
 * one name per door, so sample code and docs never pick a door-specific type
 * name; the door you imported decides what it means.
 */
export interface ViewerConfig extends ViewerConfigBase {
  engine: Engine | EngineFactory;
}

export interface InitOptions extends ViewerConfig, MountTarget {}

/** Create an <embedpdf-viewer>, configure it, append it to `target`. */
const init: (options: InitOptions) => EmbedPdfViewerElement = initViewer;

const EmbedPDF = { init };
export default EmbedPDF;
