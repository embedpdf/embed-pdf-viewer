/**
 * The LOCAL door's public surface, shared by the two deliveries that have the
 * built-in engine: the npm door (`doors/local.ts`) and the CDN snippet
 * (`doors/snippet.ts`). They differ only in the wasm default they register, so
 * everything they EXPORT lives here rather than one importing the other —
 * doors never import doors (see ../../DOORS.md).
 *
 * Not a build entry itself: importing this does not register an engine.
 */
import { initViewer, type EmbedPdfViewerElement } from '../kernel';

import type { InitOptions } from './config';

export * from '../kernel';
export type { InitOptions, LocalEngineConfig, ViewerConfig } from './config';
export type { LocalEngineRecipeOptions } from '@embedpdf/engine';

/** Create an <embedpdf-viewer>, configure it, append it to `target`. */
const init: (options: InitOptions) => EmbedPdfViewerElement = initViewer;

const EmbedPDF = { init };
export default EmbedPDF;
