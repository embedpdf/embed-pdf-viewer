/**
 * @embedpdf/angular/stamp: libraries of reusable stamps, placed by click or by code.
 *
 *   withStamp(options)                     the plugin, for provideEmbedPdf()
 *   inject(EpdfStamp)                      libraries(), assetsOf(filter), previewUrlOf(id),
 *                                          armAsset(), placeAsset(), armedAsset(), the events
 *   persistStampLibraries(stamp, store)    keep the libraries in a store from now on
 *   restoreStampLibraries(stamp, store)    bring back what the store kept (the plugin's own)
 *   indexedDbByteStore(name)               the browser's store for them
 */

// The plugin's types and helpers, so app code has one import for the feature.
export * from '@embedpdf/plugin-stamp';
// The browser store for `persistStampLibraries` / `restoreStampLibraries`, written once in
// `@embedpdf/web` (structurally the plugin's `StampLibraryStore`).
export { indexedDbByteStore } from '@embedpdf/web';
export type { ByteStore } from '@embedpdf/web';
// Named, so it wins over the plugin's helper of the same name, which listens with
// `onLibraryChanged` where the service has the `libraryChanged$` stream.
export {
  EpdfStamp,
  persistStampLibraries,
  withStamp,
  type PersistStampLibrariesOptions,
} from './stamp';
