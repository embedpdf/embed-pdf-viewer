/**
 * @embedpdf/svelte/stamp — stamps: libraries of marks you pick from and place.
 *
 * Thin by design: the plugin owns the libraries, their stamps and the cached previews. Placing
 * needs no component here: an armed stamp rides the annotation plugin, whose `<AnnotationLayer>`
 * draws the ghost under the pointer.
 *
 *   const stamp = useStamp();
 *   const assets = useStampAssets(() => ({ libraryId })); // assets.current
 *   const stampState = useStampState(); // stampState.armedAsset
 *   await stamp.armAsset(assetId); // the next click places it
 */

// Registration travels with the UI.
export * from '@embedpdf/plugin-stamp';
// The browser store for `persistStampLibraries` / `restoreStampLibraries` (structurally the
// plugin's `StampLibraryStore`), written once in `@embedpdf/web`.
export { indexedDbByteStore } from '@embedpdf/web';
export type { ByteStore } from '@embedpdf/web';

export {
  useStamp,
  useStampAssetPreviewUrl,
  useStampAssets,
  useStampEvent,
  useStampLibraries,
  useStampSettings,
  useStampState,
} from './stamp/readers.svelte';
