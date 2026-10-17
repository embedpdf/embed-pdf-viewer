/**
 * Registers the cloud engine as the element's default, as `@embedpdf/viewer` registers the
 * built-in one: what makes this package's door the cloud door.
 *
 * The door also says how its documents open (`{ token }` is the engine's `{ kind: 'token' }`) and
 * the engine stamp libraries and signature marks open in. The cloud engine renders the pages, but
 * a stamp library is a PDF cut into stamps and previewed in the browser, which takes a local
 * engine: it's imported the first time someone opens Stamps or Signatures, so a viewer that
 * never does never downloads the WebAssembly.
 */
import { cloudEngine, type CloudEngineOptions } from '@cloudpdf/engine';
import { EmbedPdfViewerElement } from '@embedpdf/viewer/core';

import { openInputOf } from './config';

const localAssetEngine = () => import('@embedpdf/engine').then((engine) => engine.localEngine());

export function registerCloudEngine(): void {
  EmbedPdfViewerElement.defaultEngineProvider = (option: unknown) => {
    const settings: CloudEngineOptions = { ...(option as CloudEngineOptions | undefined) };
    // A thunk, so the viewer owns the engine's lifetime.
    return {
      engine: () => cloudEngine(settings),
      sourceOf: openInputOf,
      plugins: { stamp: { assetEngine: localAssetEngine } },
    };
  };
}
