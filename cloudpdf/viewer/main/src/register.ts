/**
 * Registers the cloud engine as the element's default, as `@embedpdf/viewer` registers the
 * built-in one: what makes this package's door the cloud door.
 *
 * The door also says how its documents open (`{ token }` is the engine's `{ kind: 'token' }`) and
 * the engine stamp libraries and signature marks open in. The cloud engine renders the pages, but
 * a stamp library is a PDF cut into stamps and previewed in the browser, which takes a local
 * engine: it's imported the first time someone opens Stamps or Signatures, so a viewer that
 * never does never downloads the WebAssembly.
 *
 * And it adds screenshot protection: for a user who may see a document's pages only as
 * protected video, the protected display plugin shows them that way, played by the browser's
 * player from `@cloudpdf/web`. It does nothing for anyone else, and the player is imported only
 * for a protected user.
 */
import { cloudEngine, type CloudEngineOptions } from '@cloudpdf/engine';
import { protectedDisplayPlugin } from '@cloudpdf/plugin-protected-display';
import { EmbedPdfViewerElement } from '@embedpdf/viewer/core';

import { openInputOf } from './config';

const localAssetEngine = () => import('@embedpdf/engine').then((engine) => engine.localEngine());
const browserPlayer = () => import('@cloudpdf/web').then((web) => web.browserProtectedPlayer());

export function registerCloudEngine(): void {
  EmbedPdfViewerElement.defaultEngineProvider = (option: unknown) => {
    const settings: CloudEngineOptions = { ...(option as CloudEngineOptions | undefined) };
    // A thunk, so the viewer owns the engine's lifetime.
    return {
      engine: () => cloudEngine(settings),
      sourceOf: openInputOf,
      plugins: {
        stamp: { assetEngine: localAssetEngine },
        protectedDisplay: protectedDisplayPlugin({ player: browserPlayer }),
      },
    };
  };
}
